from __future__ import annotations

import io
import json
import mimetypes
import posixpath
import re
import threading
import webbrowser
import zipfile
from datetime import datetime
from html import escape
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, quote, unquote, urljoin, urlparse

import requests
from bs4 import BeautifulSoup


ROOT = Path(__file__).resolve().parent
ARTICLES = ROOT / "articles"
ARTICLES.mkdir(exist_ok=True)
SITE = "outmaxshop.ru"
SESSION = requests.Session()
SESSION.headers.update({"User-Agent": "Mozilla/5.0 (compatible; OUTMAX-Article-Editor/1.0)"})
MAX_IMAGE = 12 * 1024 * 1024


def slug(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r"[^\w-]+", "-", text, flags=re.UNICODE).strip("-_ ")
    return text[:70] or "statya"


def paths(name: str):
    name = slug(name)
    return name, ARTICLES / f"{name}.json", ARTICLES / f"{name}.html", ARTICLES / f"{name}_files"


def import_bundle(data: bytes) -> dict:
    try:
        archive = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile as exc:
        raise ValueError("Не удалось открыть ZIP") from exc
    with archive:
        files = {info.filename.replace("\\", "/"): info for info in archive.infolist()
                 if not info.is_dir() and not info.filename.startswith("__MACOSX/")}
        pages = [name for name in files if name.lower().endswith((".html", ".htm"))]
        if not pages:
            raise ValueError("В ZIP нет HTML-статьи")
        page = sorted(pages, key=lambda name: (name.count("/"), len(name)))[0]
        if files[page].file_size > 2_000_000:
            raise ValueError("HTML в архиве слишком большой")
        html = archive.read(files[page]).decode("utf-8-sig", errors="replace")
        soup = BeautifulSoup(html, "html.parser")
        base_name = slug(Path(page).stem) + "-import"
        name = base_name
        index = 2
        while (ARTICLES / f"{name}.json").exists() or (ARTICLES / f"{name}_files").exists():
            name = f"{base_name}-{index}"
            index += 1
        folder = ARTICLES / f"{name}_files"
        imported = 0
        total_images = 0
        for image in soup.select("img[src]"):
            src = image.get("src", "")
            if re.match(r"^https?://", src, re.I):
                continue
            source_path = unquote(urlparse(src).path).replace("\\", "/").lstrip("/")
            relative = posixpath.normpath(posixpath.join(posixpath.dirname(page), source_path))
            candidate = files.get(relative)
            if candidate is None:
                matches = [info for key, info in files.items() if posixpath.basename(key) == posixpath.basename(source_path)]
                candidate = matches[0] if len(matches) == 1 else None
            if candidate is None or candidate.file_size > MAX_IMAGE:
                continue
            if total_images + candidate.file_size > 64 * 1024 * 1024:
                raise ValueError("Изображения в архиве превышают 64 МБ")
            extension = Path(candidate.filename).suffix.lower()
            if extension not in (".jpg", ".jpeg", ".png", ".webp", ".gif"):
                continue
            folder.mkdir(exist_ok=True)
            filename = f"{slug(Path(candidate.filename).stem)}-{imported + 1}{extension}"
            (folder / filename).write_bytes(archive.read(candidate))
            image["src"] = f"{name}_files/{filename}"
            imported += 1
            total_images += candidate.file_size
        title = soup.title.get_text(" ", strip=True) if soup.title else Path(page).stem
        return {"id": name, "html": str(soup), "title": title, "images": imported}


def site_url(value: str) -> str:
    parsed = urlparse(value.strip())
    if parsed.scheme not in ("http", "https") or parsed.hostname not in (SITE, "www." + SITE):
        raise ValueError("Нужна ссылка с outmaxshop.ru")
    if parsed.port not in (None, 80, 443):
        raise ValueError("Неверный адрес сайта")
    return parsed._replace(scheme="https", fragment="").geturl()


def get_site(url: str) -> requests.Response:
    response = SESSION.get(site_url(url), timeout=25, allow_redirects=False)
    if response.is_redirect:
        location = response.headers.get("Location", "")
        response = SESSION.get(site_url(urljoin(url, location)), timeout=25, allow_redirects=False)
    response.raise_for_status()
    if response.is_redirect:
        raise ValueError("Слишком много перенаправлений")
    return response


def resolve_input(value: str) -> str:
    value = value.strip()
    if not re.fullmatch(r"\d{3,12}", value):
        return site_url(value)
    response = get_site(f"https://{SITE}/catalog?search={quote(value)}")
    soup = BeautifulSoup(response.content, "html.parser")
    candidates = []
    for link in soup.select("a[href]"):
        href = link.get("href", "")
        if re.search(rf"-{re.escape(value)}(?:/|$|\?)", href):
            candidates.append(site_url(urljoin(response.url, href)))
    candidates = list(dict.fromkeys(candidates))
    if len(candidates) != 1:
        raise ValueError("Не удалось однозначно найти артикул. Вставьте точную ссылку на товар.")
    return candidates[0]


def image_urls(soup: BeautifulSoup, sku: str) -> list[str]:
    result = []
    for tag in soup.select("img[src], img[data-src]"):
        for key in ("src", "data-src"):
            source = tag.get(key, "")
            if f"/img_products/{sku}/" in source and re.search(r"\.(?:jpe?g|png|webp)(?:\?|$)", source, re.I):
                try:
                    url = site_url(urljoin(f"https://{SITE}", source))
                except ValueError:
                    continue
                if url not in result:
                    result.append(url)
    return result[:8]


def fetch_product(value: str) -> dict:
    url = resolve_input(value)
    response = get_site(url)
    soup = BeautifulSoup(response.content, "html.parser")
    title_node = soup.select_one("h1.product__title")
    sku_match = re.search(r"-(\d{3,12})(?:/)?$", urlparse(response.url).path)
    if not title_node or not sku_match:
        raise ValueError("Это не карточка товара OUTMAX или её структура изменилась")
    sku = sku_match.group(1)
    title = title_node.get_text(" ", strip=True)
    page_text = soup.get_text(" ", strip=True)
    if not re.search(rf"(?:Артикул|Арт\.)\s*{re.escape(sku)}\b", page_text, re.I):
        raise ValueError("Артикул в карточке не совпадает с URL")
    detail = soup.select_one(".product-info--detail")
    features = [li.get_text(" ", strip=True).rstrip(";.") for li in detail.select("li")][:10] if detail else []
    images = image_urls(soup, sku)
    return {"url": response.url, "sku": sku, "title": title, "features": features, "images": images,
            "checkedAt": datetime.now().astimezone().isoformat(timespec="minutes")}


def document(title: str, body: str) -> str:
    css = (ROOT / "outmax.css").read_text(encoding="utf-8")
    return ("<!doctype html>\n<html lang=\"ru\"><head><meta charset=\"utf-8\">"
            "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
            "<link rel=\"stylesheet\" href=\"https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700;800&display=swap\">"
            f"<title>{escape(title)}</title><style>\n{css}\n</style></head>"
            f"<body style=\"margin:0;background:#fff\"><article class=\"om-guide\">{body}</article></body></html>\n")


class Handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        print("%s %s" % (self.address_string(), format % args))

    def send_bytes(self, data: bytes, content_type: str, status: int = 200, filename: str = ""):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        if filename:
            self.send_header("Content-Disposition", f"attachment; filename*=UTF-8''{quote(filename)}")
        self.end_headers()
        self.wfile.write(data)

    def send_json(self, value, status=200):
        self.send_bytes(json.dumps(value, ensure_ascii=False).encode("utf-8"), "application/json; charset=utf-8", status)

    def body(self, max_size=16 * 1024 * 1024):
        size = int(self.headers.get("Content-Length", "0"))
        if size > max_size:
            raise ValueError("Файл слишком большой")
        return self.rfile.read(size)

    def do_GET(self):
        path = urlparse(self.path).path
        try:
            if path == "/api/drafts":
                drafts = []
                for file in sorted(ARTICLES.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True):
                    try:
                        item = json.loads(file.read_text(encoding="utf-8"))
                        drafts.append({"id": file.stem, "title": item.get("title", file.stem), "savedAt": item.get("savedAt", "")})
                    except (ValueError, OSError):
                        pass
                return self.send_json(drafts)
            if path.startswith("/api/draft/"):
                _, file, _, _ = paths(path.rsplit("/", 1)[-1])
                return self.send_bytes(file.read_bytes(), "application/json; charset=utf-8")
            if path.startswith("/api/zip/"):
                name, draft, html, folder = paths(path.rsplit("/", 1)[-1])
                memory = io.BytesIO()
                with zipfile.ZipFile(memory, "w", compression=zipfile.ZIP_DEFLATED) as archive:
                    for file in (draft, html):
                        if file.exists(): archive.write(file, file.name)
                    if folder.exists():
                        for file in folder.iterdir():
                            if file.is_file(): archive.write(file, f"{folder.name}/{file.name}")
                return self.send_bytes(memory.getvalue(), "application/zip", filename=f"{name}.zip")
            if path == "/": path = "/index.html"
            if path.startswith("/articles/"):
                candidate = (ROOT / path.lstrip("/")).resolve()
                if not candidate.is_relative_to(ARTICLES.resolve()) or not candidate.is_file():
                    raise FileNotFoundError
            elif path in ("/index.html", "/editor.css", "/editor.js", "/editor-tools.js", "/outmax.css", "/OUTMAX.html", "/images/outmax.png"):
                candidate = ROOT / path.lstrip("/")
            else:
                raise FileNotFoundError
            media = mimetypes.guess_type(candidate.name)[0] or "application/octet-stream"
            return self.send_bytes(candidate.read_bytes(), media + ("; charset=utf-8" if media.startswith("text/") or media == "application/javascript" else ""))
        except FileNotFoundError:
            self.send_json({"error": "Не найдено"}, 404)
        except Exception as exc:
            self.send_json({"error": str(exc)}, 500)

    def do_POST(self):
        try:
            path = urlparse(self.path).path
            if path == "/api/import-bundle":
                return self.send_json(import_bundle(self.body(64 * 1024 * 1024)))
            if path == "/api/upload":
                query = parse_qs(urlparse(self.path).query)
                name, _, _, folder = paths(query.get("draft", ["statya"])[0])
                mime = self.headers.get("Content-Type", "").split(";")[0]
                extension = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif"}.get(mime)
                if not extension:
                    raise ValueError("Поддерживаются JPG, PNG, WebP и GIF")
                data = self.body()
                if not data or len(data) > MAX_IMAGE:
                    raise ValueError("Изображение пустое или больше 12 МБ")
                folder.mkdir(exist_ok=True)
                stem = slug(query.get("name", ["image"])[0])
                candidate = folder / f"{stem}{extension}"
                counter = 2
                while candidate.exists():
                    candidate = folder / f"{stem}-{counter}{extension}"
                    counter += 1
                candidate.write_bytes(data)
                return self.send_json({"src": f"{name}_files/{candidate.name}"})
            payload = json.loads(self.body().decode("utf-8"))
            if path == "/api/fetch":
                return self.send_json(fetch_product(payload.get("value", "")))
            if path == "/api/save":
                name, draft, html, _ = paths(payload.get("id", "statya"))
                title = str(payload.get("title", "Статья OUTMAX"))[:200]
                body = str(payload.get("body", ""))
                if len(body) > 2_000_000:
                    raise ValueError("Статья слишком большая")
                record = {"id": name, "title": title, "body": body, "savedAt": datetime.now().astimezone().isoformat(timespec="seconds")}
                draft.write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8")
                html.write_text(document(title, body), encoding="utf-8")
                return self.send_json({"id": name, "html": f"articles/{name}.html", "savedAt": record["savedAt"]})
            self.send_json({"error": "Не найдено"}, 404)
        except (ValueError, requests.RequestException) as exc:
            self.send_json({"error": str(exc)}, 400)
        except Exception as exc:
            self.send_json({"error": str(exc)}, 500)


if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1", 8765), Handler)
    print("Редактор OUTMAX: http://127.0.0.1:8765")
    threading.Timer(0.7, lambda: webbrowser.open("http://127.0.0.1:8765")).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("Остановлено")
