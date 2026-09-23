"""Production WSGI application for the complete OUTMAX editor."""

from __future__ import annotations

import hmac
import io
import json
import os
from datetime import datetime
from pathlib import Path

from flask import Flask, Response, jsonify, request, send_file, send_from_directory

import app as core


ROOT = Path(__file__).resolve().parent
STATIC_FILES = {
    "index.html",
    "editor.css",
    "editor-domains.js",
    "editor.js",
    "editor-library.js",
    "editor-tools.js",
    "outmax.css",
    "OUTMAX.html",
    "images/outmax.png",
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
        return "", ""


AUTH_USER, AUTH_PASSWORD = deployment_credentials()
application = Flask(__name__, static_folder=None)
application.config["MAX_CONTENT_LENGTH"] = 64 * 1024 * 1024


@application.before_request
def require_editor_authentication():
    """Protect every page and API route when deployment credentials are configured."""
    if not AUTH_USER or not AUTH_PASSWORD:
        return None
    auth = request.authorization
    valid = auth and hmac.compare_digest(auth.username or "", AUTH_USER) and hmac.compare_digest(auth.password or "", AUTH_PASSWORD)
    if valid:
        return None
    return Response("Требуется авторизация", 401, {"WWW-Authenticate": 'Basic realm="OUTMAX Editor", charset="UTF-8"'})


@application.errorhandler(413)
def file_too_large(_error):
    """Return a consistent API error for oversized uploads."""
    return jsonify(error="Файл слишком большой"), 413


@application.get("/api/drafts")
def list_drafts():
    """Return saved drafts ordered by modification time."""
    drafts = []
    for file in sorted(core.ARTICLES.glob("*.json"), key=lambda path: path.stat().st_mtime, reverse=True):
        try:
            item = json.loads(file.read_text(encoding="utf-8"))
            drafts.append({"id": file.stem, "title": item.get("title", file.stem), "savedAt": item.get("savedAt", "")})
        except (ValueError, OSError):
            continue
    return jsonify(drafts)


@application.get("/api/draft/<name>")
def read_draft(name: str):
    """Return one saved draft."""
    _, draft, _, _ = core.paths(name)
    if not draft.is_file():
        return jsonify(error="Черновик не найден"), 404
    return send_file(draft, mimetype="application/json")


@application.get("/api/export/<name>")
def export_draft(name: str):
    """Download domain-specific HTML or ZIP export."""
    safe_name, draft, _, folder = core.paths(name)
    if not draft.is_file():
        return jsonify(error="Сначала сохраните статью"), 404
    record = json.loads(draft.read_text(encoding="utf-8"))
    site_key = request.args.get("site", "ru")
    export_format = request.args.get("format", "zip")
    if site_key not in (*core.SITES, "both"):
        return jsonify(error="Неизвестный вариант сайта"), 400
    site_keys = list(core.SITES) if site_key == "both" else [site_key]
    if export_format == "html":
        if len(site_keys) != 1:
            return jsonify(error="Для двух сайтов используйте ZIP"), 400
        key = site_keys[0]
        html = core.document(str(record.get("title", "Статья OUTMAX")), core.export_body(str(record.get("body", "")), key))
        return send_file(io.BytesIO(html.encode("utf-8")), mimetype="text/html", as_attachment=True,
                         download_name=core.export_filename(safe_name, key))
    if export_format != "zip":
        return jsonify(error="Неизвестный формат экспорта"), 400
    archive = core.export_archive(safe_name, record, folder, site_keys)
    suffix = "both" if site_key == "both" else site_key
    return send_file(io.BytesIO(archive), mimetype="application/zip", as_attachment=True,
                     download_name=f"{safe_name}-outmaxshop-{suffix}.zip")


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


@application.post("/api/upload")
def upload_image():
    """Store an editor image in the current draft asset folder."""
    try:
        name, _, _, folder = core.paths(request.args.get("draft", "statya"))
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
    preferred_site = core.SITES.get(payload.get("site", "ru"), core.SITE)
    try:
        return jsonify(core.fetch_product(payload.get("value", ""), preferred_site))
    except (ValueError, core.requests.RequestException) as exc:
        return jsonify(error=str(exc)), 400


@application.post("/api/fetch-article")
def fetch_article():
    """Load an article from either OUTMAX domain."""
    payload = request.get_json(force=True)
    try:
        return jsonify(core.fetch_article(payload.get("url", "")))
    except (ValueError, core.requests.RequestException) as exc:
        return jsonify(error=str(exc)), 400


@application.post("/api/save")
def save_draft():
    """Persist the draft, generated HTML and product metadata."""
    payload = request.get_json(force=True)
    name, draft, html, _ = core.paths(payload.get("id", "statya"))
    title = str(payload.get("title", "Статья OUTMAX"))[:200]
    body = str(payload.get("body", ""))
    products = payload.get("products", [])
    if len(body) > 2_000_000:
        return jsonify(error="Статья слишком большая"), 400
    if not isinstance(products, list) or len(products) > 100:
        return jsonify(error="Слишком много товаров"), 400
    products = [
        {
            "sku": str(item.get("sku", ""))[:12],
            "title": str(item.get("title", ""))[:300],
            "url": str(item.get("url", ""))[:2000],
            "images": item.get("images", [])[:8],
            "features": item.get("features", [])[:10],
        }
        for item in products if isinstance(item, dict)
    ]
    record = {
        "id": name,
        "title": title,
        "body": body,
        "products": products,
        "savedAt": datetime.now().astimezone().isoformat(timespec="seconds"),
    }
    draft.write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8")
    html.write_text(core.document(title, body), encoding="utf-8")
    return jsonify(id=name, html=f"articles/{name}.html", savedAt=record["savedAt"])


@application.get("/articles/<path:filename>")
def article_asset(filename: str):
    """Serve saved article images and generated files from persistent storage."""
    return send_from_directory(core.ARTICLES, filename)


@application.get("/")
def editor_root():
    """Open the editor directly without a landing page."""
    return send_from_directory(ROOT, "index.html")


@application.get("/<path:filename>")
def editor_static(filename: str):
    """Serve only the allow-listed editor assets."""
    if filename not in STATIC_FILES:
        return jsonify(error="Не найдено"), 404
    return send_from_directory(ROOT, filename)


if __name__ == "__main__":
    from waitress import serve
    serve(application, host=os.getenv("OUTMAX_HOST", "127.0.0.1"), port=int(os.getenv("OUTMAX_PORT", "8765")))
