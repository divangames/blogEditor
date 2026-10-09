"""Production WSGI application for the complete OUTMAX editor."""

from __future__ import annotations

import hashlib
import base64
import functools
import hmac
import io
import json
import os
import secrets
import re
import shutil
import zipfile
import mimetypes
from datetime import datetime
from pathlib import Path

from flask import Flask, Response, g, jsonify, redirect, request, send_file, send_from_directory

import app as core
import shared_blocks
from article_storage import read_document, save_document, SaveConflict, document_history, history_revision, restored_content, atomic_write
import notisend_client as notisend


ROOT = Path(__file__).resolve().parent
TIPTAP_BUNDLE = ""
EMAIL_BRAND_ASSET_DATA = {}
EMAIL_TEMPLATE_PAGES = {}

@functools.lru_cache(maxsize=1)
def tiptap_archive():
    if TIPTAP_BUNDLE:
        return zipfile.ZipFile(io.BytesIO(base64.b64decode(TIPTAP_BUNDLE)))
    file=ROOT/'release/tiptap-prototype/server.zip'
    if not file.is_file():
        raise FileNotFoundError('Tiptap bundle is not built')
    return zipfile.ZipFile(file)

def tiptap_media_manifest():
    return json.loads(tiptap_archive().read('media-manifest.json'))

def tiptap_media_folder():
    folder=core.ARTICLES/'_tiptap_media'
    folder.mkdir(exist_ok=True)
    return folder

def tiptap_media_chunk(digest,part):
    if g.editor_user['role']!='admin':return jsonify(error='Доступ закрыт'),403
    entries=[v for v in tiptap_media_manifest().values() if v['sha256']==digest]
    if not re.fullmatch(r'[a-f0-9]{64}',digest) or not entries:return jsonify(error='Неизвестный ресурс'),404
    item=entries[0]
    if part>=len(item['chunks']) or request.content_length is None or request.content_length>262144:return jsonify(error='Некорректный фрагмент'),400
    data=request.get_data()
    if len(data)!=min(262144,item['size']-part*262144) or hashlib.sha256(data).hexdigest()!=item['chunks'][part]:return jsonify(error='Проверка фрагмента не пройдена'),400
    atomic_write(tiptap_media_folder()/f'{digest}.{part:06d}.part',data)
    return jsonify(ok=True)

def tiptap_media_complete(digest):
    if g.editor_user['role']!='admin':return jsonify(error='Доступ закрыт'),403
    entries=[v for v in tiptap_media_manifest().values() if v['sha256']==digest]
    if not re.fullmatch(r'[a-f0-9]{64}',digest) or not entries:return jsonify(error='Неизвестный ресурс'),404
    item=entries[0];folder=tiptap_media_folder();target=folder/(digest+'.bin')
    if target.exists() and target.stat().st_size==item['size'] and hashlib.sha256(target.read_bytes()).hexdigest()==digest:return jsonify(ok=True)
    try:data=b''.join((folder/f'{digest}.{i:06d}.part').read_bytes() for i in range(len(item['chunks'])))
    except FileNotFoundError:return jsonify(error='Ресурс загружен не полностью'),409
    if len(data)!=item['size'] or hashlib.sha256(data).hexdigest()!=digest:return jsonify(error='Проверка ресурса не пройдена'),400
    atomic_write(target,data)
    return jsonify(ok=True)
STATIC_FILES = {
    "index.html",
    "editor.css",
    "editor-brand.js",
    "editor-domains.js",
    "editor.js",
    "editor-styling.js",
    "editor-library.js",
    "editor-tools.js",
    "editor-shared-blocks.js",
    "online.js",
    "editor-account.js",
    "outmax.css",
    "hasl.css",
    "OUTMAX.html",
    "images/outmax.png",
    "images/mail.png",
    "images/hasl.svg",
    "images/hasle.png",
    "vendor/jszip.min.js",
    "email/index.html",
    "email/email.css",
    "email/email-components.css",
    "email/email-renderer.js",
    "email/email-controller.js",
    "email/notisend-panel.css",
    "email/notisend-panel.js",
}


def deployment_credentials() -> tuple[str, str]:
    """Load credentials from environment variables or generated hosting settings."""
    username = os.getenv("OUTMAX_USER", "")
    password = os.getenv("OUTMAX_PASSWORD", "")
    if username and password:
        return username, password
    try:
        from deploy_settings import OUTMAX_PASSWORD, OUTMAX_USER
        return str(OUTMAX_USER), str(OUTMAX_PASSWORD)
    except ImportError:
        settings = ROOT / 'release' / '.outmax-deploy-credentials.json'
        if settings.is_file():
            saved = json.loads(settings.read_text(encoding='utf-8'))
            return str(saved.get('user', '')), str(saved.get('password', ''))
        return "", ""


AUTH_USER, AUTH_PASSWORD = deployment_credentials()
application = Flask(__name__, static_folder=None)
application.config["MAX_CONTENT_LENGTH"] = None
application.add_url_rule('/api/tiptap-media/<digest>/<int:part>',view_func=tiptap_media_chunk,methods=['POST'])
application.add_url_rule('/api/tiptap-media/<digest>/complete',view_func=tiptap_media_complete,methods=['POST'])


class EditorApiAlias:
    """Route editor requests around the VPS collaboration service's /api prefix."""

    def __init__(self, wrapped):
        self.wrapped = wrapped

    def __call__(self, environ, start_response):
        path = environ.get("PATH_INFO", "")
        if path == "/editor-api" or path.startswith("/editor-api/"):
            environ["PATH_INFO"] = "/api" + path[len("/editor-api"):]
        return self.wrapped(environ, start_response)


application.wsgi_app = EditorApiAlias(application.wsgi_app)


from accounts import install_accounts
install_accounts(application, core, AUTH_USER, AUTH_PASSWORD)


@functools.lru_cache(maxsize=1)
def email_template_pages():
    if EMAIL_TEMPLATE_PAGES:return EMAIL_TEMPLATE_PAGES
    folder=ROOT/'email'/'templates'
    return {path.name:path.read_text(encoding='utf-8') for path in folder.glob('*.html') if path.is_file()}

@application.get('/email-templates/')
@application.get('/email-templates/<brand>/')
@application.get('/email-templates/<brand>/<filename>')
def public_email_template(brand=None,filename=None):
    # Public examples contain no account, campaign or draft data.
    if brand not in (None,'outmax','hasl'):return jsonify(error='Шаблон не найден'),404
    key='index.html' if brand is None else brand+'-index.html' if filename is None else filename
    if filename and (not filename.startswith(brand+'-') or filename.endswith('-index.html')):return jsonify(error='Шаблон не найден'),404
    page=email_template_pages().get(key)
    if page is None:return jsonify(error='Шаблон не найден'),404
    response=Response(page,mimetype='text/html')
    response.headers['X-Content-Type-Options']='nosniff'
    if filename and request.args.get('download')=='1':
        response.headers['Content-Disposition']='attachment; filename="'+filename+'"'
    return response

@application.get('/api/shared-blocks')
def shared_block_library():
    try:
        return jsonify(blocks=shared_blocks.list_blocks(core.article_storage(), request.args.get('brand', 'outmax')))
    except ValueError as exc:
        return jsonify(error=str(exc)), 400


@application.post('/api/shared-blocks')
def save_shared_block():
    payload = request.get_json(force=True)
    try:
        return jsonify(shared_blocks.save_block(core.article_storage(), request.args.get('brand', 'outmax'), payload))
    except shared_blocks.BlockConflict as exc:
        return jsonify(error=str(exc), current=exc.current), 409
    except ValueError as exc:
        return jsonify(error=str(exc)), 400


@application.errorhandler(413)
def file_too_large(_error):
    """Return a consistent API error for oversized uploads."""
    return jsonify(error="Файл слишком большой"), 413


@application.get("/api/drafts")
def list_drafts():
    """Return saved drafts ordered by modification time."""
    brand = request.args.get("brand", "outmax")
    drafts = []
    for file in sorted(core.article_storage().glob("*.json"), key=lambda path: path.stat().st_mtime, reverse=True):
        if (brand == "hasl") != file.stem.startswith("hasl--"):
            continue
        try:
            item = json.loads(file.read_text(encoding="utf-8"))
            drafts.append({"id": core.public_draft_id(file.stem, brand), "title": item.get("title", file.stem), "savedAt": item.get("savedAt", "")})
        except (ValueError, OSError):
            continue
    return jsonify(drafts)


@application.get("/api/draft/<name>")
def read_draft(name: str):
    """Return one saved draft."""
    brand = request.args.get("brand", "outmax")
    _, draft, _, _ = core.paths(core.storage_name(name, brand))
    if not draft.is_file():
        return jsonify(error="Черновик не найден"), 404
    record = read_document(draft)
    record['body'] = shared_blocks.resolve_body(record.get('body', ''), core.article_storage(), brand)
    return jsonify(record)


@application.get('/api/draft/<name>/history')
def article_history(name):
    _,file,_,_=core.paths(core.storage_name(name,request.args.get('brand','outmax')))
    try:
        return jsonify(document_history(file,before=request.args.get('before')))
    except FileNotFoundError as exc:return jsonify(error=str(exc)),404
    except ValueError as exc:return jsonify(error=str(exc)),400


@application.get('/api/draft/<name>/history/<revision>')
def article_revision(name,revision):
    _,file,_,_=core.paths(core.storage_name(name,request.args.get('brand','outmax')))
    try:return jsonify(history_revision(file,revision))
    except FileNotFoundError as exc:return jsonify(error=str(exc)),404
    except ValueError as exc:return jsonify(error=str(exc)),400


@application.post('/api/draft/<name>/history/<revision>/restore')
def restore_article_revision(name,revision):
    brand=request.args.get('brand','outmax')
    _,file,_,_=core.paths(core.storage_name(name,brand))
    payload=request.get_json(force=True)
    try:
        content=restored_content(file,revision)
        content.update(savedBy={'id':g.editor_user['id'],'name':g.editor_user['name']},saveKind='restore')
        result=save_document(file,payload,content,lambda item:core.admin_document(item['title'],item['body'],brand))
        return jsonify(**result)
    except SaveConflict as exc:return jsonify(error=str(exc),conflict=True,current=exc.current),409
    except FileNotFoundError as exc:return jsonify(error=str(exc)),404
    except ValueError as exc:return jsonify(error=str(exc)),400


@application.get("/api/export/<name>")
def export_draft(name: str):
    """Download domain-specific HTML or ZIP export."""
    brand = request.args.get("brand", "outmax")
    stored_name = core.storage_name(name, brand)
    _, draft, _, folder = core.paths(stored_name)
    safe_name = core.slug(name)
    if not draft.is_file():
        return jsonify(error="Сначала сохраните статью"), 404
    record = json.loads(draft.read_text(encoding="utf-8"))
    try:
        record['body'] = shared_blocks.resolve_body(record.get('body', ''), core.article_storage(), brand, exporting=True)
    except ValueError as exc:
        return jsonify(error=str(exc)), 409
    site_key = request.args.get("site", "ru")
    export_format = request.args.get("format", "zip")
    local_images = request.args.get("localImages", "0") == "1"
    sites = core.brand_sites(brand)
    if site_key not in (*sites, "both"):
        return jsonify(error="Неизвестный вариант сайта"), 400
    site_keys = list(sites) if site_key == "both" else [site_key]
    if export_format == "html":
        if '_shared_assets/' in record['body']:
            return jsonify(error='Для общего блока с загруженными изображениями выберите HTML + image (ZIP).'), 400
        if len(site_keys) != 1:
            return jsonify(error="Для двух сайтов используйте ZIP"), 400
        key = site_keys[0]
        html = core.admin_document(str(record.get("title", f"Статья {brand.upper()}")), core.export_body(str(record.get("body", "")), key, brand), brand)
        return send_file(io.BytesIO(html.encode("utf-8")), mimetype="text/html", as_attachment=True,
                         download_name=core.export_filename(safe_name, key, brand))
    if export_format != "zip":
        return jsonify(error="Неизвестный формат экспорта"), 400
    archive = core.export_archive(safe_name, record, folder, site_keys, local_images, brand)
    suffix = "both" if site_key == "both" else site_key
    return send_file(io.BytesIO(archive), mimetype="application/zip", as_attachment=True,
                     download_name=f"{safe_name}-{'hasl' if brand == 'hasl' else 'outmaxshop'}-{suffix}.zip")


@application.get("/api/zip/<name>")
def legacy_zip(name: str):
    """Keep the previous ZIP endpoint compatible with existing clients."""
    return export_draft(name)


@application.post("/api/import-bundle")
def import_bundle():
    """Import an article ZIP and its local images."""
    try:
        return jsonify(core.import_bundle(request.get_data()))
    except ValueError as exc:
        return jsonify(error=str(exc)), 400


@application.post("/api/email/import-rar")
def import_email_rar():
    """Преобразовать загруженный RAR в ZIP, понятный email-редактору."""
    try:
        data = core.rar_to_zip(request.get_data())
        return send_file(io.BytesIO(data), mimetype="application/zip", download_name="email-import.zip")
    except ValueError as exc:
        return jsonify(error=str(exc)), 400


@application.get("/api/email/fetch-image")
def fetch_email_image():
    """Загрузить одно изображение магазина для стабильного локального предпросмотра."""
    try:
        content, extension = core.download_email_image(request.args.get("url", ""))
        media = {".jpg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif"}[extension]
        return Response(content, mimetype=media, headers={"Cache-Control": "private, max-age=3600"})
    except (ValueError, core.requests.RequestException) as exc:
        return jsonify(error=str(exc)), 400




EMAIL_SENDER_SITES = ('outmax_ru', 'outmax_com', 'hasl_ru', 'hasle_com')


def email_sender_profiles_file() -> Path:
    return core.article_storage() / '_email_settings' / 'senders.json'


def email_sender_profiles() -> dict:
    file = email_sender_profiles_file()
    return json.loads(file.read_text(encoding='utf-8')) if file.is_file() else {}


@application.get('/api/email-sender-profiles')
def read_email_sender_profiles():
    """Personal site defaults follow the account across devices."""
    return jsonify(profiles=email_sender_profiles())


@application.put('/api/email-sender-profiles/<site>')
def save_email_sender_profile(site: str):
    if site not in EMAIL_SENDER_SITES:
        return jsonify(error='Неизвестный сайт'), 400
    payload = request.get_json(force=True)
    if not isinstance(payload, dict):
        return jsonify(error='Неверный профиль'), 400
    profile = {key: str(payload.get(key) or '').strip() for key in ('fromEmail','fromName','testEmail')}
    if len(profile['fromName']) > 120:
        return jsonify(error='Имя отправителя слишком длинное'), 400
    for key in ('fromEmail','testEmail'):
        value = profile[key]
        if len(value) > 320 or (value and not re.fullmatch(r'[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+',value)):
            return jsonify(error='Укажите корректный email'), 400
    if any('\r' in value or '\n' in value for value in profile.values()):
        return jsonify(error='Профиль не должен содержать переносы строк'), 400
    ids = payload.get('listIds', [])
    if not isinstance(ids, list) or len(ids) > 100 or any(not isinstance(value,(str,int)) or not str(value).strip() or len(str(value)) > 100 for value in ids):
        return jsonify(error='Неверный список групп'), 400
    profile['listIds'] = list(dict.fromkeys(str(value).strip() for value in ids))
    profiles = email_sender_profiles()
    profiles[site] = profile
    file = email_sender_profiles_file()
    file.parent.mkdir(parents=True, exist_ok=True)
    temporary = file.with_name('senders.' + secrets.token_hex(6) + '.tmp')
    try:
        temporary.write_text(json.dumps(profiles, ensure_ascii=False, indent=2),encoding='utf-8')
        temporary.replace(file)
    finally:
        temporary.unlink(missing_ok=True)
    return jsonify(site=site, profile=profile)


def email_projects_dir() -> Path:
    """Личное хранилище проектов email-редактора текущего пользователя."""
    folder = core.article_storage() / "_email_projects"
    folder.mkdir(parents=True, exist_ok=True)
    return folder


def email_project_paths(name: str) -> tuple[str, Path, Path]:
    project_id = core.slug(name or "rassylka")
    folder = email_projects_dir()
    return project_id, folder / f"{project_id}.json", folder / f"{project_id}_files"


def email_project_summary(record: dict) -> dict:
    return {
        "id": record.get("id"),
        "subject": record.get("subject") or "Без темы",
        "filename": record.get("filename") or record.get("id"),
        "site": record.get("site") or "outmax_ru",
        "campaignId": record.get("notisendCampaignId"),
        "workflowStatus": record.get("workflowStatus") or "draft",
        "reviewComment": record.get("reviewComment") or "",
        "reviewerName": record.get("reviewerName") or "",
        "reviewUpdatedAt": record.get("reviewUpdatedAt"),
        "createdAt": record.get("createdAt"),
        "savedAt": record.get("savedAt"),
    }


@application.get("/api/email-projects")
def list_email_projects():
    """Вернуть личные проекты email-редактора, новые сверху."""
    items = []
    for file in email_projects_dir().glob("*.json"):
        try:
            record = json.loads(file.read_text(encoding="utf-8"))
            items.append(email_project_summary(record))
        except (OSError, ValueError):
            continue
    items.sort(key=lambda item: item.get("savedAt") or "", reverse=True)
    return jsonify(items=items)


@application.get("/api/email-projects/<name>")
def read_email_project(name: str):
    """Открыть один личный email-проект."""
    _, project, _ = email_project_paths(name)
    if not project.is_file():
        return jsonify(error="Email-проект не найден"), 404
    try:
        return jsonify(json.loads(project.read_text(encoding="utf-8")))
    except (OSError, ValueError):
        return jsonify(error="Email-проект повреждён"), 500


@application.post("/api/email-projects/<name>")
def save_email_project(name: str):
    """Сохранить редактируемое состояние email-проекта и связь с NotiSend."""
    project_id, project, _ = email_project_paths(name)
    payload = request.get_json(force=True)
    canvas_html = str(payload.get("canvasHtml") or "")
    rendered_html = str(payload.get("renderedHtml") or "")
    if len(canvas_html) > 2_000_000 or len(rendered_html) > 3_000_000:
        return jsonify(error="HTML проекта слишком большой"), 400
    previous = json.loads(project.read_text(encoding="utf-8")) if project.is_file() else {}
    assets = payload.get("assets") if isinstance(payload.get("assets"), dict) else {}
    if len(assets) > 200:
        return jsonify(error="Слишком много изображений в email-проекте"), 400
    assets = {str(key)[:1000]: Path(str(value)).name for key, value in assets.items()}
    utm = payload.get("utm") if isinstance(payload.get("utm"), dict) else {}
    now = datetime.now().astimezone().isoformat(timespec="seconds")
    workflow_status = previous.get("workflowStatus") or "draft"
    review_comment = previous.get("reviewComment") or ""
    reviewer_id = previous.get("reviewerId")
    reviewer_name = previous.get("reviewerName") or ""
    review_updated_at = previous.get("reviewUpdatedAt")
    if previous:
        changed_for_review = any((
            str(previous.get("renderedHtml") or "") != rendered_html,
            str(previous.get("subject") or "") != str(payload.get("subject") or "Без темы")[:300],
            str(previous.get("fromEmail") or "") != str(payload.get("fromEmail") or "")[:320],
            [str(value) for value in previous.get("listIds", [])] != [str(value)[:100] for value in payload.get("listIds", [])[:100]],
        ))
        if changed_for_review and workflow_status in ("review","approved","notisend"):
            workflow_status = "draft"
            review_comment = ""
            reviewer_id = None
            reviewer_name = ""
            review_updated_at = None
    record = {
        "id": project_id,
        "filename": str(payload.get("filename") or project_id)[:120],
        "subject": str(payload.get("subject") or "Без темы")[:300],
        "preheader": str(payload.get("preheader") or "")[:300],
        "site": str(payload.get("site") or "outmax_ru")[:30],
        "canvasHtml": canvas_html,
        "renderedHtml": rendered_html,
        "importState": payload.get("importState") if isinstance(payload.get("importState"), dict) else {},
        "fromEmail": str(payload.get("fromEmail") or "")[:320],
        "fromName": str(payload.get("fromName") or "")[:200],
        "testEmail": str(payload.get("testEmail") or "")[:320],
        "listIds": [str(value)[:100] for value in payload.get("listIds", [])[:100]],
        "utm": {
            "enabled": bool(utm.get("enabled")),
            "source": str(utm.get("source") or "")[:100],
            "medium": str(utm.get("medium") or "")[:100],
            "campaign": str(utm.get("campaign") or "")[:200],
        },
        "notisendCampaignId": payload.get("notisendCampaignId"),
        "campaignFingerprint": str(payload.get("campaignFingerprint") or "")[:128],
        "workflowStatus": workflow_status,
        "reviewComment": review_comment,
        "reviewerId": reviewer_id,
        "reviewerName": reviewer_name,
        "reviewUpdatedAt": review_updated_at,
        "submittedAt": previous.get("submittedAt"),
        "assets": assets,
        "publishedImages": previous.get("publishedImages", []),
        "createdAt": previous.get("createdAt") or now,
        "savedAt": now,
    }
    project.parent.mkdir(parents=True, exist_ok=True)
    project.write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8")
    return jsonify(email_project_summary(record))


@application.delete("/api/email-projects/<name>")
def delete_email_project(name: str):
    """Удалить личный email-проект вместе с сохранёнными локальными изображениями."""
    _, project, assets = email_project_paths(name)
    if not project.exists():
        return jsonify(error="Email-проект не найден"), 404
    record=json.loads(project.read_text(encoding='utf-8'))
    candidates=set(record.get('publishedImages',[]))
    for filename in record.get('assets',{}).values():
        source=assets/Path(filename).name
        if source.is_file():candidates.add(hashlib.sha256(source.read_bytes()).hexdigest()+source.suffix)
    project.unlink(missing_ok=True)
    retained=set()
    for other in core.ARTICLES.glob('users/*/_email_projects/*.json'):
        try:
            text=other.read_text(encoding='utf-8');data=json.loads(text)
            retained.update(data.get('publishedImages',[]))
            retained.update(name for name in candidates if name in text)
        except (OSError,ValueError):
            # Unreadable metadata must not cause another project's images to disappear.
            retained.update(candidates)
    for filename in candidates-retained:
        if re.fullmatch(r'[a-f0-9]{64}\.(?:jpg|png|webp|gif)',filename):
            (email_public_images_dir()/filename).unlink(missing_ok=True)
    application.extensions["feedback_cleanup"](g.editor_user["id"], "email::"+project.stem)
    if assets.exists():
        shutil.rmtree(assets)
    return jsonify(ok=True)


@application.post("/api/email-projects/<name>/asset")
def save_email_project_asset(name: str):
    """Сохранить локальное изображение проекта отдельно от JSON."""
    _, _, folder = email_project_paths(name)
    source_path = request.args.get("path", "")
    mime = (request.content_type or "").split(";", 1)[0]
    extension = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif"}.get(mime)
    data = request.get_data()
    if not source_path or not extension:
        return jsonify(error="Неверное изображение проекта"), 400
    if not data or len(data) > core.MAX_IMAGE:
        return jsonify(error="Изображение пустое или больше 12 МБ"), 400
    folder.mkdir(parents=True, exist_ok=True)
    filename = hashlib.sha256(source_path.encode("utf-8")).hexdigest()[:20] + extension
    (folder / filename).write_bytes(data)
    return jsonify(filename=filename)


@application.get("/api/email-projects/<name>/asset/<filename>")
def read_email_project_asset(name: str, filename: str):
    """Вернуть сохранённое локальное изображение проекта авторизованному владельцу."""
    _, _, folder = email_project_paths(name)
    return send_from_directory(folder, Path(filename).name)




def email_public_images_dir() -> Path:
    # Immutable copies survive edits and preview revocation; unused copies are removed on project deletion.
    return core.ARTICLES / "_email_public_images"


OUTMAX_EMAIL_LOGO = ROOT / "images" / "outmax.png"
OUTMAX_EMAIL_LOGO_PUBLIC_NAME = hashlib.sha256(OUTMAX_EMAIL_LOGO.read_bytes()).hexdigest() + ".png"


@application.post("/api/email-projects/<name>/publish-images")
def publish_email_project_images(name: str):
    """Publish only referenced raster assets from the caller's saved project."""
    _, project, folder = email_project_paths(name)
    if not project.is_file():
        return jsonify(error="Сначала сохраните email-проект"), 404
    record = json.loads(project.read_text(encoding="utf-8"))
    document = str(record.get("renderedHtml") or "")
    allowed = set(record.get("assets", {}).values())
    references = set(re.findall(r'__EMAIL_PROJECT_ASSET__/([a-f0-9]{20}\.(?:jpg|png|webp|gif))', document))
    copies = {}
    for filename in references:
        if filename not in allowed:
            return jsonify(error="Изображение не принадлежит этому проекту"), 400
        source = folder / filename
        if not source.is_file():
            return jsonify(error="Изображение проекта отсутствует. Сохраните проект заново."), 400
        data = source.read_bytes()
        suffix = source.suffix
        valid = {".png": data.startswith(b"\x89PNG\r\n\x1a\n"),
                 ".jpg": data.startswith(b"\xff\xd8\xff"),
                 ".gif": data.startswith((b"GIF87a", b"GIF89a")),
                 ".webp": data.startswith(b"RIFF") and data[8:12] == b"WEBP"}
        if not data or len(data) > core.MAX_IMAGE or not valid.get(suffix):
            return jsonify(error="Неверный формат изображения проекта"), 400
        copies[filename] = (hashlib.sha256(data).hexdigest() + suffix, data)
    origin = request.host_url.rstrip('/')
    if request.host.split(':')[0] in ('news.outmax-office.ru','213.139.209.107'):
        origin = 'https://news.outmax-office.ru'
    for filename, (public_name, _) in copies.items():
        document = document.replace('__EMAIL_PROJECT_ASSET__/' + filename,
            origin + '/editor-api/public-email-images/' + public_name)
    if '__EMAIL_PROJECT_ASSET__/' in document:
        return jsonify(error="Не удалось подготовить все изображения письма"), 400
    # Validate all sources before writing any public files.
    destination = email_public_images_dir()
    if copies:
        destination.mkdir(parents=True, exist_ok=True)
    for public_name, data in copies.values():
        target = destination / public_name
        if not target.exists():
            temporary = destination / (public_name + '.' + secrets.token_hex(6) + '.tmp')
            try:
                temporary.write_bytes(data)
                temporary.replace(target)
            finally:
                temporary.unlink(missing_ok=True)
    record['publishedImages']=sorted(set(record.get('publishedImages',[]))|{name for name,_ in copies.values()})
    atomic_write(project,json.dumps(record,ensure_ascii=False).encode('utf-8'))
    return jsonify(html=document, imageCount=len(copies))


@application.get("/api/public-email-images/<filename>")
def public_email_image(filename: str):
    """Anonymous raster image only; never expose a project or its private folder."""
    if not re.fullmatch(r'[a-f0-9]{64}\.(?:jpg|png|webp|gif)', filename):
        return jsonify(error="Изображение не найдено"), 404
    brand_file = next((path for path in (ROOT/'images'/'email').glob('*') if path.is_file() and path.suffix.lower() in ('.png','.gif') and hashlib.sha256(path.read_bytes()).hexdigest()+path.suffix.lower() == filename), None)
    if filename in EMAIL_BRAND_ASSET_DATA:
        response = Response(base64.b64decode(EMAIL_BRAND_ASSET_DATA[filename]), mimetype='image/gif' if filename.endswith('.gif') else 'image/png')
    elif brand_file:
        response = send_from_directory(brand_file.parent, brand_file.name, max_age=31536000)
    elif filename == OUTMAX_EMAIL_LOGO_PUBLIC_NAME:
        response = send_from_directory(OUTMAX_EMAIL_LOGO.parent, OUTMAX_EMAIL_LOGO.name, max_age=31536000)
    else:
        response = send_from_directory(email_public_images_dir(), filename, max_age=31536000)
    response.headers['Cache-Control'] = 'public, max-age=31536000, immutable'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    return response


@application.get("/api/notisend/status")
def notisend_status():
    """Проверить подключение NotiSend, не раскрывая секреты браузеру."""
    try:
        return jsonify(notisend.status(ROOT))
    except notisend.NotiSendError as exc:
        return jsonify(error=str(exc), connected=False), 502


@application.post("/api/notisend/configure")
def configure_notisend():
    """Сохранить секреты NotiSend на сервере; доступно только администратору."""
    if not g.editor_user["admin"]:
        return jsonify(error="Доступ только администратору"), 403
    try:
        notisend.save_config(ROOT, request.get_json(force=True))
        return jsonify(ok=True)
    except (NotImplementedError, notisend.NotiSendError, OSError, ValueError) as exc:
        return jsonify(error=str(exc)), 400


@application.get("/api/notisend/lists")
def notisend_lists():
    """Получить доступные группы получателей NotiSend."""
    try:
        return jsonify(items=notisend.lists(ROOT))
    except notisend.NotiSendError as exc:
        return jsonify(error=str(exc)), 502


@application.post("/api/notisend/test")
def send_notisend_test():
    """Отправить одно тестовое письмо через SMTP NotiSend."""
    try:
        return jsonify(notisend.send_test(ROOT, request.get_json(force=True)))
    except notisend.NotiSendError as exc:
        return jsonify(error=str(exc)), 400


@application.get("/api/notisend/campaigns")
def notisend_campaigns():
    """Получить последние рассылки и их сводную статистику."""
    try:
        return jsonify(notisend.campaigns(ROOT, request.args.get("pageSize", 25, type=int)))
    except notisend.NotiSendError as exc:
        return jsonify(error=str(exc)), 502


@application.get("/api/notisend/archive")
def notisend_archive():
    try:
        result = notisend.campaign_archive_page(ROOT, request.args.get("page", 1, type=int))
        with _archive_labels_lock:
            labels = _read_archive_labels()
        for item in result["items"]:
            if str(item["id"]) in labels:
                item["brand"] = labels[str(item["id"])]
        return jsonify(result)
    except notisend.NotiSendError as exc:
        return jsonify(error=str(exc)), 502


import threading
_archive_labels_lock = threading.Lock()


def _read_archive_labels():
    target = core.ARTICLES / "_accounts" / "notisend-labels.json"
    try:
        return json.loads(target.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


@application.put("/api/notisend/archive/<int:campaign_id>/brand")
def set_notisend_archive_brand(campaign_id):
    if not (g.editor_user["admin"] or g.editor_user["role"] == "moderator"):
        return jsonify(error="Бренды назначает администратор или модератор"), 403
    brand = (request.get_json(silent=True) or {}).get("brand")
    if brand not in ("outmax", "hasl", "haslestore", "unassigned", "other"):
        return jsonify(error="Неизвестный бренд"), 400
    with _archive_labels_lock:
        labels = _read_archive_labels()
        labels[str(campaign_id)] = brand
        target = core.ARTICLES / "_accounts" / "notisend-labels.json"
        target.parent.mkdir(parents=True, exist_ok=True)
        temporary = target.with_suffix(".tmp")
        temporary.write_text(json.dumps(labels, ensure_ascii=False), encoding="utf-8")
        temporary.replace(target)
    return jsonify(brand=brand)


@application.post("/api/notisend/campaigns")
def create_notisend_campaign():
    """Создать черновик кампании из готового HTML email-редактора."""
    try:
        payload = request.get_json(force=True)
        return jsonify(notisend.create_campaign(ROOT, payload))
    except notisend.NotiSendError as exc:
        return jsonify(error=str(exc)), 400


@application.post("/api/upload")
def upload_image():
    """Store an editor image in the current draft asset folder."""
    try:
        brand = request.args.get("brand", "outmax")
        public_name = core.slug(request.args.get("draft", "statya"))
        name, _, _, folder = core.paths(core.storage_name(public_name, brand))
        mime = request.content_type.split(";")[0] if request.content_type else ""
        extension = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif"}.get(mime)
        data = request.get_data()
        if not extension:
            raise ValueError("Поддерживаются JPG, PNG, WebP и GIF")
        if not data or len(data) > core.MAX_IMAGE:
            raise ValueError("Изображение пустое или больше 12 МБ")
        folder.mkdir(exist_ok=True)
        stem = core.slug(request.args.get("name", "image"))
        candidate = folder / f"{stem}{extension}"
        counter = 2
        while candidate.exists():
            candidate = folder / f"{stem}-{counter}{extension}"
            counter += 1
        candidate.write_bytes(data)
        return jsonify(src=f"{name}_files/{candidate.name}")
    except ValueError as exc:
        return jsonify(error=str(exc)), 400


@application.post("/api/fetch")
def fetch_product():
    """Load a product from either OUTMAX domain."""
    payload = request.get_json(force=True)
    brand = payload.get("brand", "outmax")
    sites = core.brand_sites(brand)
    preferred_site = sites.get(payload.get("site", "ru"), sites["ru"])
    try:
        return jsonify(core.fetch_product(payload.get("value", ""), preferred_site, brand))
    except (ValueError, core.requests.RequestException) as exc:
        return jsonify(error=str(exc)), 400


@application.post("/api/fetch-article")
def fetch_article():
    """Load an article from either OUTMAX domain."""
    payload = request.get_json(force=True)
    brand = payload.get("brand", "outmax")
    try:
        return jsonify(core.fetch_article(payload.get("url", ""), brand))
    except (ValueError, core.requests.RequestException) as exc:
        return jsonify(error=str(exc)), 400


@application.post("/api/save")
def save_draft():
    """Persist the draft, generated HTML and product metadata."""
    payload = request.get_json(force=True)
    brand = payload.get("brand", "outmax")
    public_name = core.slug(payload.get("id", "statya"))
    name, draft, html, folder = core.paths(core.storage_name(public_name, brand))
    title = str(payload.get("title", f"Статья {brand.upper()}"))
    body = str(payload.get("body", ""))
    products = payload.get("products", [])
    if not isinstance(products, list) or len(products) > 100:
        return jsonify(error="Слишком много товаров"), 400
    body, localized_images, failed_images = (body,0,0) if payload.get('automatic') else core.localize_external_images(body, name, folder)
    products = [
        {
            "sku": str(item.get("sku", ""))[:12],
            "title": str(item.get("title", ""))[:300],
            "url": str(item.get("url", ""))[:2000],
            "images": item.get("images", [])[:8],
            "features": item.get("features", [])[:10],
            "properties": item.get("properties", [])[:20],
            "details": item.get("details", [])[:20],
            "descriptionHtml": core.product_description_html(item.get("descriptionHtml", ""), str(item.get("url", ""))),
            "price": int(item.get("price", 0) or 0),
            "oldPrice": int(item.get("oldPrice", 0) or 0),
            "sizes": item.get("sizes", [])[:20],
            "labels": item.get("labels", [])[:5],
            "inStock": bool(item.get("inStock")),
        }
        for item in products if isinstance(item, dict)
    ]
    record = {
        "id": public_name,
        "brand": brand,
        "title": title,
        "body": body,
        "products": products,
        "savedBy": {"id":g.editor_user['id'],"name":g.editor_user['name']},
        "saveKind": "automatic" if payload.get('automatic') else "manual",
        "savedAt": datetime.now().astimezone().isoformat(timespec="seconds"),
        "editorEngine": "html",
        "tiptap": None,
    }
    try:
        result = save_document(draft, payload, record, lambda item: core.admin_document(item['title'], item['body'], brand))
    except SaveConflict as exc:
        return jsonify(error=str(exc), conflict=True, current=exc.current), 409
    except ValueError as exc:
        return jsonify(error=str(exc)), 400
    return jsonify(**result, html=f"articles/{name}.html",
                   localizedImages=localized_images, failedImages=failed_images)


@application.post('/api/tiptap-assets/<name>')
def save_tiptap_asset(name):
    """Immutable, content-addressed media in the authenticated user's archive."""
    if not re.fullmatch(r'[a-f0-9]{64}\.(png|jpg|jpeg|gif|webp)', name):
        return jsonify(error='Некорректное имя изображения'),400
    data=request.stream.read(core.MAX_IMAGE+1)
    if not data or len(data)>core.MAX_IMAGE or hashlib.sha256(data).hexdigest()!=name.split('.')[0]:
        return jsonify(error='Размер или контрольная сумма изображения не совпадает'),400
    folder=core.article_storage()/'_tiptap_assets';folder.mkdir(exist_ok=True)
    target=folder/name
    if not target.exists():atomic_write(target,data)
    return jsonify(src='/articles/_tiptap_assets/'+name)


@application.post('/api/tiptap/save')
def save_tiptap_document():
    """Persist the native model and fallback HTML through the same revision journal."""
    try:
        raw=request.stream.read(12*1024*1024+1)
        if len(raw)>12*1024*1024:raise ValueError('Запрос больше 12 МБ')
        payload=json.loads(raw)
        if not isinstance(payload,dict):raise ValueError('Нужен объект документа')
        brand=payload.get('brand')
        if brand not in ('outmax','hasl'):raise ValueError('Неизвестный бренд')
        native=payload.get('tiptap')
        if not isinstance(native,dict) or native.get('format')!='brand-block-prototype-v2' or native.get('brand')!=brand:
            raise ValueError('Нужна блочная модель Tiptap v2')
        if len(json.dumps(native))>10*1024*1024:raise ValueError('Модель больше 10 МБ')
        nodes=0
        def check(value,depth=0):
            nonlocal nodes
            nodes+=1
            if depth>80 or nodes>300000:raise ValueError('Модель слишком сложная')
            if isinstance(value,dict):
                if 'htmlAttrs' in value:
                    attrs=value['htmlAttrs']
                    if not isinstance(attrs,dict):raise ValueError('Некорректные атрибуты')
                    for key,item in attrs.items():
                        if key.lower().startswith('on') or key.lower() in ('srcdoc','formaction'):
                            raise ValueError('Активные атрибуты запрещены')
                        if re.search(r'(javascript\s*:|vbscript\s*:|expression\s*\()',str(item),re.I):
                            raise ValueError('Активное содержимое запрещено')
                for item in value.values():check(item,depth+1)
            elif isinstance(value,list):
                for item in value:check(item,depth+1)
        check(native.get('document'))
        if not isinstance(native.get('document'),dict) or native['document'].get('type')!='doc':
            raise ValueError('Нет документа Tiptap')
        refs=native.get('serverAssets',{})
        if not isinstance(refs,dict) or len(refs)>1500:raise ValueError('Слишком много ресурсов')
        for path,src in refs.items():
            if not isinstance(path,str) or not isinstance(src,str) or not re.fullmatch(r'/articles/_tiptap_assets/[a-f0-9]{64}\.(png|jpg|jpeg|gif|webp)',src):
                raise ValueError('Некорректный ресурс')
            if not (core.article_storage()/src.removeprefix('/articles/')).is_file():
                raise ValueError('Изображение ещё не загружено')
        body=str(payload.get('body',''))
        if len(body)>5*1024*1024:raise ValueError('HTML больше 5 МБ')
        soup=core.BeautifulSoup(body,'html.parser')
        if soup.select('script,iframe,object,embed,style,link,base,form,input,button,textarea'):
            raise ValueError('Активное содержимое HTML запрещено')
        for tag in soup.find_all(True):
            for key,value in tag.attrs.items():
                if key.lower().startswith('on') or key.lower() in ('srcdoc','formaction') or re.search(r'(javascript\s*:|vbscript\s*:|expression\s*\()',str(value),re.I):
                    raise ValueError('Активное содержимое HTML запрещено')
        public=core.slug(payload.get('id','statya'))
        _,file,_,_=core.paths(core.storage_name(public,brand))
        record=dict(id=public,brand=brand,title=str(payload.get('title','Статья'))[:300],body=body,products=[],
                    editorEngine='tiptap',tiptap=native,saveKind='automatic' if payload.get('automatic') else 'manual',
                    savedBy={'id':g.editor_user['id'],'name':g.editor_user['name']})
        result=save_document(file,payload,record,lambda item:core.admin_document(item['title'],item['body'],brand))
        return jsonify(**result)
    except SaveConflict as exc:return jsonify(error=str(exc),conflict=True,current=exc.current),409
    except (ValueError,TypeError) as exc:return jsonify(error=str(exc)),400


@application.get("/articles/<path:filename>")
def article_asset(filename: str):
    """Serve saved article images and generated files from persistent storage."""
    return send_from_directory(core.article_storage(), filename)


INSTRUCTIONS_ASSETS = {}


@application.get('/instructions')
@application.get('/instructions/')
@application.get('/instructions/<path:asset>')
def instructions_page(asset='index.html'):
    """Отдаёт базу знаний и только зарегистрированные скриншоты; поддерживает старый VPS."""
    if request.path == '/instructions':
        return redirect('/instructions/')
    if INSTRUCTIONS_ASSETS:
        encoded = INSTRUCTIONS_ASSETS.get(asset)
        if encoded is None:
            return jsonify(error='Не найдено'), 404
        import base64
        response = Response(base64.b64decode(encoded), mimetype=mimetypes.guess_type(asset)[0] or 'application/octet-stream')
    elif asset == 'index.html':
        from build_instructions import build
        response = Response(build(), mimetype='text/html')
    elif re.fullmatch(r'screens/[a-z-]+\.png', asset):
        response = send_from_directory(ROOT / 'instructions', asset)
    else:
        return jsonify(error='Не найдено'), 404
    response.headers['Cache-Control'] = 'private, no-cache'
    return response


@application.get("/")
def editor_root():
    """Open the editor directly without a landing page."""
    return send_from_directory(ROOT, "index.html")

@application.get('/tiptap')
@application.get('/tiptap/')
@application.get('/tiptap/<path:asset>')
def tiptap_editor(asset='index.html'):
    """Authenticated preview; serves only exact public files in its bundle."""
    try:
        archive=tiptap_archive()
        manifest=tiptap_media_manifest()
        if asset in manifest:
            item=manifest[asset];file=tiptap_media_folder()/(item['sha256']+'.bin')
            if not file.is_file():return jsonify(error='Ресурс ещё не опубликован'),404
            body=file.read_bytes()
        elif asset not in archive.namelist() or asset.endswith('/'):
            return jsonify(error='Не найдено'),404
        else:body=archive.read(asset)
    except FileNotFoundError:
        return jsonify(error='Новый редактор ещё не собран'),503
    content_type=mimetypes.guess_type(asset)[0] or 'application/octet-stream'
    response=Response(body,mimetype=content_type)
    response.headers['Cache-Control']='private, no-store'
    response.headers['Content-Security-Policy']="default-src 'self'; img-src 'self' https: data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; font-src 'self' data:; base-uri 'self'; object-src 'none'; frame-ancestors 'self'"
    response.headers['X-Content-Type-Options']='nosniff'
    return response


@application.get("/hasl")
@application.get("/hasl/")
def hasl_editor_root():
    """Open the dedicated ХАСЛ article editor."""
    return send_from_directory(ROOT, "index.html")


@application.get("/email")
@application.get("/email/")
def email_editor_root():
    """Открыть отдельный редактор email-рассылок OUTMAX."""
    return send_from_directory(ROOT / "email", "index.html")


@application.get("/<path:filename>")
def editor_static(filename: str):
    """Serve only the allow-listed editor assets."""
    if filename not in STATIC_FILES:
        return jsonify(error="Не найдено"), 404
    return send_from_directory(ROOT, filename)


if __name__ == "__main__":
    from waitress import serve
    serve(application, host=os.getenv("OUTMAX_HOST", "127.0.0.1"), port=int(os.getenv("OUTMAX_PORT", "8765")))
