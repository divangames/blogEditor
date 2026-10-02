"""Production WSGI application for the complete OUTMAX editor."""

from __future__ import annotations

import hashlib
import hmac
import io
import json
import os
import shutil
from datetime import datetime
from pathlib import Path

from flask import Flask, Response, g, jsonify, request, send_file, send_from_directory

import app as core
import notisend_client as notisend


ROOT = Path(__file__).resolve().parent
STATIC_FILES = {
    "index.html",
    "editor.css",
    "editor-brand.js",
    "editor-domains.js",
    "editor.js",
    "editor-library.js",
    "editor-tools.js",
    "online.js",
    "editor-account.js",
    "outmax.css",
    "hasl.css",
    "OUTMAX.html",
    "images/outmax.png",
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
    return send_file(draft, mimetype="application/json")


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
    site_key = request.args.get("site", "ru")
    export_format = request.args.get("format", "zip")
    local_images = request.args.get("localImages", "0") == "1"
    sites = core.brand_sites(brand)
    if site_key not in (*sites, "both"):
        return jsonify(error="Неизвестный вариант сайта"), 400
    site_keys = list(sites) if site_key == "both" else [site_key]
    if export_format == "html":
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
    if len(canvas_html) > 2_000_000:
        return jsonify(error="HTML проекта слишком большой"), 400
    previous = json.loads(project.read_text(encoding="utf-8")) if project.is_file() else {}
    assets = payload.get("assets") if isinstance(payload.get("assets"), dict) else {}
    if len(assets) > 200:
        return jsonify(error="Слишком много изображений в email-проекте"), 400
    assets = {str(key)[:1000]: Path(str(value)).name for key, value in assets.items()}
    utm = payload.get("utm") if isinstance(payload.get("utm"), dict) else {}
    now = datetime.now().astimezone().isoformat(timespec="seconds")
    record = {
        "id": project_id,
        "filename": str(payload.get("filename") or project_id)[:120],
        "subject": str(payload.get("subject") or "Без темы")[:300],
        "preheader": str(payload.get("preheader") or "")[:300],
        "site": str(payload.get("site") or "outmax_ru")[:30],
        "canvasHtml": canvas_html,
        "importState": payload.get("importState") if isinstance(payload.get("importState"), dict) else {},
        "fromEmail": str(payload.get("fromEmail") or "")[:320],
        "fromName": str(payload.get("fromName") or "")[:200],
        "listIds": [str(value)[:100] for value in payload.get("listIds", [])[:100]],
        "utm": {
            "enabled": bool(utm.get("enabled")),
            "source": str(utm.get("source") or "")[:100],
            "medium": str(utm.get("medium") or "")[:100],
            "campaign": str(utm.get("campaign") or "")[:200],
        },
        "notisendCampaignId": payload.get("notisendCampaignId"),
        "campaignFingerprint": str(payload.get("campaignFingerprint") or "")[:128],
        "assets": assets,
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
    project.unlink(missing_ok=True)
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
    body, localized_images, failed_images = core.localize_external_images(body, name, folder)
    products = [
        {
            "sku": str(item.get("sku", ""))[:12],
            "title": str(item.get("title", ""))[:300],
            "url": str(item.get("url", ""))[:2000],
            "images": item.get("images", [])[:8],
            "features": item.get("features", [])[:10],
            "price": int(item.get("price", 0) or 0),
            "oldPrice": int(item.get("oldPrice", 0) or 0),
            "sizes": item.get("sizes", [])[:20],
            "labels": item.get("labels", [])[:5],
            "inStock": bool(item.get("inStock")),
        }
        for item in products if isinstance(item, dict)
    ]
    previous = json.loads(draft.read_text(encoding="utf-8")) if draft.exists() else {}
    record = {
        "createdAt": previous.get("createdAt") or previous.get("savedAt") or datetime.now().astimezone().isoformat(timespec="seconds"),
        "id": public_name,
        "brand": brand,
        "title": title,
        "body": body,
        "products": products,
        "savedAt": datetime.now().astimezone().isoformat(timespec="seconds"),
    }
    draft.write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8")
    html.write_text(core.admin_document(title, body, brand), encoding="utf-8")
    return jsonify(id=public_name, html=f"articles/{name}.html", savedAt=record["savedAt"],
                   localizedImages=localized_images, failedImages=failed_images)


@application.get("/articles/<path:filename>")
def article_asset(filename: str):
    """Serve saved article images and generated files from persistent storage."""
    return send_from_directory(core.article_storage(), filename)


@application.get("/")
def editor_root():
    """Open the editor directly without a landing page."""
    return send_from_directory(ROOT, "index.html")


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
