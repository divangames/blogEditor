from __future__ import annotations

import io
import hashlib
import ipaddress
import json
import mimetypes
import os
import posixpath
import re
import socket
import tempfile
import threading
import webbrowser
import zipfile
from concurrent.futures import ThreadPoolExecutor, as_completed
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
EMBEDDED_HASL_CSS = ""
BRAND_SITES = {
    "outmax": {"ru": "outmaxshop.ru", "com": "outmaxshop.com"},
    "hasl": {"ru": "хасл.рф", "com": "haslestore.com"},
}
SITES = BRAND_SITES["outmax"]
SITE = SITES["ru"]
SUPPORTED_HOSTS = {
    host
    for sites in BRAND_SITES.values()
    for domain in sites.values()
    for host in (domain, domain.encode("idna").decode("ascii"), f"www.{domain}", f"www.{domain.encode('idna').decode('ascii')}")
}
EMAIL_IMAGE_DOMAINS = ("outmaxshop.ru", "outmaxshop.com", "хасл.рф", "haslestore.com")
EMAIL_IMAGE_HOSTS = {
    host
    for domain in EMAIL_IMAGE_DOMAINS
    for host in (domain.encode("idna").decode("ascii"), f"www.{domain.encode('idna').decode('ascii')}")
}
SESSION = requests.Session()
SESSION.headers.update({"User-Agent": "Mozilla/5.0 (compatible; OUTMAX-Article-Editor/1.0)"})
IMAGE_HTTP = threading.local()
MAX_IMAGE = 12 * 1024 * 1024
ARTICLE_PATHS = {
    "outmax": re.compile(r"^/(?:article/[^/?#]+|news/[^/?#]+|\d+-(?:news|blog)/\d+-[^/?#]+)/?$", re.I),
    "hasl": re.compile(r"^/(?:news/[^/?#]+|article/[^/?#]+|blog/[^/?#]+)/?$", re.I),
}


def brand_sites(brand: str) -> dict[str, str]:
    return BRAND_SITES.get(brand, SITES)


def brand_name(brand: str) -> str:
    return "ХАСЛ" if brand == "hasl" else "OUTMAX"


def storage_name(name: str, brand: str = "outmax") -> str:
    safe = slug(name)
    return f"hasl--{safe}" if brand == "hasl" else safe


def public_draft_id(name: str, brand: str = "outmax") -> str:
    return name.removeprefix("hasl--") if brand == "hasl" else name


def slug(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r"[^\w-]+", "-", text, flags=re.UNICODE).strip("-_ ")
    return text[:70] or "statya"


def paths(name: str):
    name = slug(name)
    return name, ARTICLES / f"{name}.json", ARTICLES / f"{name}.html", ARTICLES / f"{name}_files"


def public_web_url(value: str) -> str:
    parsed = urlparse(value)
    if parsed.scheme not in ("http", "https") or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError("Неверный адрес внешнего изображения")
    if parsed.port not in (None, 80, 443):
        raise ValueError("Неверный порт внешнего изображения")
    addresses = socket.getaddrinfo(parsed.hostname, parsed.port or (443 if parsed.scheme == "https" else 80), type=socket.SOCK_STREAM)
    for address in addresses:
        ip = ipaddress.ip_address(address[4][0])
        if not ip.is_global:
            raise ValueError("Локальные адреса изображений запрещены")
    return value


def download_external_image(url: str) -> tuple[bytes, str]:
    current = public_web_url(url)
    client = getattr(IMAGE_HTTP, "session", None)
    if client is None:
        client = requests.Session()
        client.headers.update(SESSION.headers)
        IMAGE_HTTP.session = client
    for _ in range(5):
        response = client.get(current, timeout=25, allow_redirects=False, stream=True)
        if response.is_redirect:
            current = public_web_url(urljoin(current, response.headers.get("Location", "")))
            response.close()
            continue
        response.raise_for_status()
        mime = response.headers.get("Content-Type", "").split(";", 1)[0].lower()
        extension = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif"}.get(mime)
        if not extension:
            response.close()
            raise ValueError("Ссылка не ведёт на поддерживаемое изображение")
        chunks = []
        size = 0
        for chunk in response.iter_content(64 * 1024):
            size += len(chunk)
            if size > MAX_IMAGE:
                response.close()
                raise ValueError("Внешнее изображение больше 12 МБ")
            chunks.append(chunk)
        response.close()
        if not size:
            raise ValueError("Внешнее изображение пустое")
        return b"".join(chunks), extension
    raise ValueError("Слишком много перенаправлений изображения")


def download_email_image(url: str) -> tuple[bytes, str]:
    """Загрузить изображение только с разрешённых доменов магазинов."""
    hostname = (urlparse(url).hostname or "").encode("idna").decode("ascii").lower()
    if hostname not in EMAIL_IMAGE_HOSTS:
        raise ValueError("Изображения разрешены только с сайтов OUTMAX и ХАСЛ")
    return download_external_image(url)


def localize_external_images(body: str, name: str, folder: Path) -> tuple[str, int, int]:
    soup = BeautifulSoup(body, "html.parser")
    imported = 0
    failed = 0
    for image in soup.select("img[src]"):
        source = image.get("src", "").strip()
        parsed = urlparse(source)
        if parsed.scheme not in ("http", "https") or parsed.hostname in SUPPORTED_HOSTS:
            continue
        digest = hashlib.sha256(source.encode("utf-8")).hexdigest()[:16]
        existing = next(folder.glob(f"external-{digest}.*"), None) if folder.exists() else None
        try:
            if existing is None:
                content, extension = download_external_image(source)
                folder.mkdir(exist_ok=True)
                existing = folder / f"external-{digest}{extension}"
                existing.write_bytes(content)
                imported += 1
            image["src"] = f"{name}_files/{existing.name}"
            image.attrs.pop("srcset", None)
        except (OSError, ValueError, requests.RequestException):
            failed += 1
    return str(soup), imported, failed


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
        products = None
        drafts = [item for item in files if item.lower().endswith(".json") and
                  posixpath.splitext(item)[0] == posixpath.splitext(page)[0]]
        if drafts and files[drafts[0]].file_size < 500_000:
            try:
                record = json.loads(archive.read(files[drafts[0]]).decode("utf-8-sig"))
                if isinstance(record.get("products"), list):
                    products = record["products"]
            except (ValueError, UnicodeError):
                pass
        return {"id": name, "html": str(soup), "title": title, "images": imported, "products": products}


def rar_to_zip(data: bytes) -> bytes:
    """Преобразовать ограниченный по размеру RAR в ZIP для браузерного импортёра."""
    try:
        import rarfile
    except ImportError as exc:
        raise ValueError("Поддержка RAR не установлена. Выполните установку requirements.txt") from exc
    unrar = Path(r"C:\Program Files\WinRAR\UnRAR.exe")
    seven_zip = Path(r"C:\Program Files\7-Zip\7z.exe")
    if unrar.is_file():
        rarfile.UNRAR_TOOL = str(unrar)
    if seven_zip.is_file():
        rarfile.SEVENZIP_TOOL = str(seven_zip)
    if not data or len(data) > 64 * 1024 * 1024:
        raise ValueError("RAR пустой или больше 64 МБ")
    output = io.BytesIO()
    total = 0
    temporary_path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".rar", delete=False) as source:
            source.write(data)
            temporary_path = Path(source.name)
        with rarfile.RarFile(temporary_path) as archive, zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as converted:
            files = [item for item in archive.infolist() if not item.isdir()]
            if len(files) > 500:
                raise ValueError("В RAR слишком много файлов")
            for item in files:
                safe_name = posixpath.normpath(item.filename.replace("\\", "/")).lstrip("/")
                if safe_name.startswith("../") or safe_name == "..":
                    continue
                if item.file_size > MAX_IMAGE or not safe_name.lower().endswith((".html", ".htm", ".jpg", ".jpeg", ".png", ".webp", ".gif")):
                    continue
                total += item.file_size
                if total > 64 * 1024 * 1024:
                    raise ValueError("Распакованные файлы RAR превышают 64 МБ")
                converted.writestr(safe_name, archive.read(item))
    except rarfile.RarCannotExec as exc:
        raise ValueError("Для распаковки RAR нужен UnRAR, 7-Zip или bsdtar на сервере") from exc
    except rarfile.Error as exc:
        raise ValueError("Не удалось открыть RAR") from exc
    finally:
        if temporary_path is not None:
            temporary_path.unlink(missing_ok=True)
    if not output.getvalue():
        raise ValueError("В RAR нет поддерживаемых HTML или изображений")
    return output.getvalue()


def site_url(value: str, brand: str = "outmax") -> str:
    parsed = urlparse(value.strip())
    hostname = (parsed.hostname or "").encode("idna").decode("ascii").lower()
    allowed = {item.encode("idna").decode("ascii") for item in brand_sites(brand).values()}
    if parsed.scheme not in ("http", "https") or hostname.removeprefix("www.") not in allowed:
        domains = " или ".join(brand_sites(brand).values())
        raise ValueError(f"Нужна ссылка с {domains}")
    if parsed.port not in (None, 80, 443):
        raise ValueError("Неверный адрес сайта")
    return parsed._replace(scheme="https", fragment="").geturl()


def get_site(url: str, brand: str = "outmax") -> requests.Response:
    current = site_url(url, brand)
    name = brand_name(brand)
    try:
        for _ in range(5):
            response = SESSION.get(current, timeout=25, allow_redirects=False)
            if not response.is_redirect:
                break
            location = response.headers.get("Location", "")
            if not location:
                raise ValueError(f"Сайт {name} вернул пустое перенаправление")
            current = site_url(urljoin(current, location), brand)
        else:
            raise ValueError(f"Сайт {name} выполнил слишком много перенаправлений")
        if response.status_code == 404:
            raise ValueError(f"Статья не найдена на {urlparse(current).hostname}. Проверьте адрес и наличие статьи на выбранном домене")
        response.raise_for_status()
        return response
    except requests.Timeout as exc:
        raise ValueError(f"Сайт {name} не ответил за 25 секунд. Повторите загрузку") from exc
    except requests.RequestException as exc:
        raise ValueError(f"Не удалось загрузить страницу {name}: {exc}") from exc


def resolve_input(value: str, preferred_site: str = SITE, brand: str = "outmax") -> str:
    value = value.strip()
    if not re.fullmatch(r"\d{3,12}", value):
        return site_url(value, brand)
    sites = brand_sites(brand)
    if preferred_site not in sites.values():
        preferred_site = sites["ru"]
    if brand == "hasl":
        response = SESSION.get("https://autocomplete.diginetica.net/autocomplete",
                               params={"apiKey": "FWUXHJEN1U", "st": value}, timeout=25)
        response.raise_for_status()
        products = response.json().get("products", [])
        candidates = [site_url(urljoin(f"https://{preferred_site}", item.get("link_url", "")), brand)
                      for item in products if str(item.get("id", "")) == value and item.get("link_url")]
        candidates = list(dict.fromkeys(candidates))
        if len(candidates) != 1:
            raise ValueError("Не удалось однозначно найти артикул ХАСЛ. Вставьте точную ссылку на товар.")
        return candidates[0]
    response = get_site(f"https://{preferred_site}/catalog?search={quote(value)}", brand)
    soup = BeautifulSoup(response.content, "html.parser")
    candidates = []
    for link in soup.select("a[href]"):
        href = link.get("href", "")
        if re.search(rf"-{re.escape(value)}(?:/|$|\?)", href):
            candidates.append(site_url(urljoin(response.url, href), brand))
    candidates = list(dict.fromkeys(candidates))
    if len(candidates) != 1:
        raise ValueError("Не удалось однозначно найти артикул. Вставьте точную ссылку на товар.")
    return candidates[0]


def image_urls(soup: BeautifulSoup, sku: str, page_url: str) -> list[str]:
    result = []
    for tag in soup.select("img[src], img[data-src]"):
        for key in ("src", "data-src"):
            source = tag.get(key, "")
            if f"/img_products/{sku}/" in source and re.search(r"\.(?:jpe?g|png|webp)(?:\?|$)", source, re.I):
                try:
                    url = site_url(urljoin(page_url, source))
                except ValueError:
                    continue
                if url not in result:
                    result.append(url)
    return result[:8]


def fetch_product(value: str, preferred_site: str = SITE, brand: str = "outmax") -> dict:
    url = resolve_input(value, preferred_site, brand)
    response = get_site(url, brand)
    soup = BeautifulSoup(response.content, "html.parser")
    if brand == "hasl":
        data_node = soup.select_one("script#__NEXT_DATA__")
        try:
            product = json.loads(data_node.string)["props"]["pageProps"]["product"] if data_node and data_node.string else {}
        except (KeyError, TypeError, json.JSONDecodeError):
            product = {}
        sku = str(product.get("sku") or product.get("id") or "")
        title = str(product.get("name") or "").strip()
        if not sku or not title:
            raise ValueError("Это не карточка товара ХАСЛ или её структура изменилась")
        images = [str(item.get("url")) for item in product.get("images", []) if isinstance(item, dict) and item.get("url")][:8]
        features = [f"{item.get('name')}: {item.get('value')}" for item in product.get("characteristics", [])
                    if isinstance(item, dict) and item.get("name") and item.get("value")][:10]
        price = int(product.get("price", {}).get("value", 0) or 0) // 100
        old_price = int(product.get("oldPrice", {}).get("value", 0) or 0) // 100
        sizes = []
        for attribute in product.get("attributes", []):
            if not isinstance(attribute, dict) or str(attribute.get("name", "")).lower() != "размер":
                continue
            sizes = [{"name": str(item.get("name", "")), "hint": str(item.get("hint", ""))}
                     for item in attribute.get("values", []) if isinstance(item, dict) and item.get("name")][:20]
            break
        labels = [str(item.get("name") or item.get("text") or item.get("value"))
                  for item in product.get("labels", []) if isinstance(item, dict)
                  and (item.get("name") or item.get("text") or item.get("value"))][:5]
        return {"url": response.url, "sku": sku, "title": title, "features": features, "images": images,
                "price": price, "oldPrice": old_price, "sizes": sizes, "labels": labels,
                "inStock": bool(product.get("inStock")),
                "checkedAt": datetime.now().astimezone().isoformat(timespec="minutes")}
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
    images = image_urls(soup, sku, response.url)
    return {"url": response.url, "sku": sku, "title": title, "features": features, "images": images,
            "checkedAt": datetime.now().astimezone().isoformat(timespec="minutes")}


def promote_cta_links(article: BeautifulSoup, soup: BeautifulSoup) -> None:
    """Convert isolated action links such as «Смотреть…» into styled CTA buttons."""
    for link in list(article.select("a[href]")):
        text = link.get_text(" ", strip=True)
        parent = link.parent
        excluded = link.find_parent(["nav", "h1", "h2", "h3", "h4"]) or link.find_parent(class_=["om-actions", "om-cta"])
        is_isolated = parent and parent.name == "p" and parent.get_text(" ", strip=True) == text and len(parent.find_all("a", recursive=False)) == 1
        if not excluded and is_isolated and re.match(r"^(?:смотреть|перейти|купить|выбрать|открыть)\b", text, re.I):
            wrapper = soup.new_tag("div")
            wrapper["class"] = ["om-cta"]
            link["class"] = ["om-button", "om-button--red"]
            parent.replace_with(wrapper)
            wrapper.append(link)


def fetch_article(value: str, brand: str = "outmax") -> dict:
    url = site_url(value, brand)
    if not ARTICLE_PATHS.get(brand, ARTICLE_PATHS["outmax"]).fullmatch(urlparse(url).path):
        raise ValueError(f"Вставьте ссылку на отдельную статью {'ХАСЛ' if brand == 'hasl' else 'OUTMAX'}")
    response = get_site(url, brand)
    if len(response.content) > 3_000_000:
        raise ValueError("Страница слишком большая")
    soup = BeautifulSoup(response.content, "html.parser")
    article = soup.select_one(".news-article__content article")
    if article is None and brand == "hasl":
        # Current HASL news pages use CSS-module class names whose suffix changes
        # between site builds. The stable component prefix identifies the article
        # body without pulling in recommendations, navigation, or the footer.
        article = soup.select_one('[class*="NewsEntityContent_content__"]')
    if article is None:
        content = soup.select_one(".news-article__content")
        candidates = [] if content is None else [
            node for node in content.find_all(["div", "section"])
            if node.find(["h1", "h2"], recursive=False) and node.find("p")
        ]
        article = max(candidates, key=lambda node: len(node.get_text(" ", strip=True)), default=None)
    if article is None:
        candidates = soup.select("article.om-guide, main article, article")
        article = max(candidates, key=lambda node: len(node.get_text(" ", strip=True)), default=None)
    if not article or not article.find(["h2", "p"]):
        raise ValueError(f"Не удалось найти текст статьи на странице {brand_name(brand)}")
    heading = article.find("h1") or soup.select_one(".news-article__content h1, main h1, h1")
    default_title = f"Статья {brand_name(brand)}"
    title = heading.get_text("", strip=True) if heading else (soup.title.get_text(" ", strip=True) if soup.title else default_title)
    header = article.find("header", recursive=False)
    if header is None:
        header = soup.new_tag("header")
        article.insert(0, header)
    existing_h1 = article.find("h1")
    if existing_h1 is not None:
        if existing_h1.parent is not header:
            header.insert(0, existing_h1.extract())
    else:
        h1 = soup.new_tag("h1")
        h1.string = title
        header.insert(0, h1)
    article["class"] = ["om-guide"]
    for nav in article.find_all("nav"):
        nav["class"] = ["om-toc"]
    product_thumbnails = {}
    for card in article.select('article[id^="product-"], article[id^="model-"], article[data-full-review]'):
        card_classes = list(card.get("class", []))
        if "om-product" not in card_classes:
            card_classes.append("om-product")
        card["class"] = card_classes
        direct = card.find_all(recursive=False)
        if direct and re.fullmatch(r"Арт\.\s*\d{3,12}", direct[0].get_text(" ", strip=True)):
            direct[0]["class"] = ["om-sku"]
        gallery = card.select_one("[data-product-gallery], [data-gallery], .om-gallery")
        if gallery:
            gallery["class"] = ["om-gallery"]
        title_link = card.select_one("h3 a")
        thumbnail = gallery.select_one("img[src]") if gallery else None
        if title_link and thumbnail:
            key = re.sub(r"\s*→\s*$", "", title_link.get_text(" ", strip=True)).casefold()
            product_thumbnails[key] = thumbnail.get("src")
        actions = card.find_all("div", recursive=False)
        if actions:
            last = actions[-1]
            if last.find("a") and last is not gallery:
                last["class"] = ["om-actions"]
    for row in article.select("table tbody tr"):
        cell = row.find(["td", "th"], recursive=False)
        link = cell.find("a", href=True) if cell else None
        if not link or cell.find("img"):
            continue
        key = re.sub(r"\s*→\s*$", "", link.get_text(" ", strip=True)).casefold()
        source = product_thumbnails.get(key)
        if not source:
            continue
        wrapper = soup.new_tag("span")
        wrapper["class"] = ["om-model-cell"]
        image = soup.new_tag("img", src=source, alt=f"{link.get_text(' ', strip=True)}, фото товара")
        image["class"] = ["om-model-thumb"]
        image["loading"] = "lazy"
        link.replace_with(wrapper)
        wrapper.append(image)
        wrapper.append(link)
    promote_cta_links(article, soup)
    for tag in article.select("img,source,video,iframe,a"):
        for attr in ("src", "href", "poster"):
            raw = tag.get(attr)
            if raw:
                absolute = urljoin(response.url, raw)
                if urlparse(absolute).scheme in ("http", "https"):
                    tag[attr] = absolute
        if tag.name == "a" and tag.get("href"):
            parsed_link = urlparse(tag["href"])
            parsed_page = urlparse(response.url)
            if parsed_link.fragment and parsed_link.netloc == parsed_page.netloc and parsed_link.path.rstrip("/") == parsed_page.path.rstrip("/"):
                tag["href"] = f"#{parsed_link.fragment}"
        if tag.name == "img":
            tag["src"] = urljoin(response.url, tag.get("data-src") or tag.get("src", ""))
            tag["loading"] = "lazy"
            tag.attrs.pop("srcset", None)
    identifier = slug(urlparse(response.url).path.rstrip("/").rsplit("/", 1)[-1])
    return {"id": identifier, "title": title[:200], "html": str(article), "url": response.url}


def document(title: str, body: str, brand: str = "outmax") -> str:
    css = (ROOT / ("hasl.css" if brand == "hasl" else "outmax.css")).read_text(encoding="utf-8")
    font = "Montserrat:wght@400;500;600;700;800;900" if brand == "hasl" else "Open+Sans:wght@400;600;700;800"
    return ("<!doctype html>\n<html lang=\"ru\"><head><meta charset=\"utf-8\">"
            "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
            f"<link rel=\"stylesheet\" href=\"https://fonts.googleapis.com/css2?family={font}&display=swap\">"
            f"<title>{escape(title)}</title><style>\n{css}\n</style></head>"
            f"<body style=\"margin:0;background:#fff\"><article class=\"om-guide\">{body}</article></body></html>\n")


def admin_document(title: str, body: str, brand: str = "outmax") -> str:
    """Standalone export that survives an administrator stripping classes and external CSS."""
    fallback_css = ""
    if brand == "hasl":
        css = EMBEDDED_HASL_CSS or (ROOT / "hasl.css").read_text(encoding="utf-8")
        css = css.replace("</style", "<\\/style")
        fallback_css = f"<style>\n{css}\n</style>"
    article_style = (f"width:100%;max-width:{'860px' if brand == 'hasl' else '920px'};margin:0 auto;padding:24px 16px 72px;"
                     "background:#fff;box-sizing:border-box;"
                     f"font-family:{'Montserrat,Arial,sans-serif' if brand == 'hasl' else 'Arial,sans-serif'};"
                     f"color:{'#090b0d' if brand == 'hasl' else '#231815'};font-size:16px;line-height:1.6")
    return ("<!doctype html>\n<html lang=\"ru\"><head><meta charset=\"utf-8\">"
            "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
            f"<link rel=\"stylesheet\" href=\"https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800;900&display=swap\">{fallback_css}"
            f"<title>{escape(title)}</title></head><body style=\"margin:0;background:#fff\">"
            f"<article style=\"{article_style}\">{body}</article></body></html>\n")


def export_body(body: str, site_key: str, brand: str = "outmax") -> str:
    """Prepare inline-only HTML accepted by the OUTMAX administrator."""
    sites = brand_sites(brand)
    domain = sites.get(site_key)
    if not domain:
        raise ValueError(f"Выберите {sites['ru']}, {sites['com']} или оба сайта")
    soup = BeautifulSoup(body, "html.parser")
    if brand == "hasl":
        for section in soup.select('section.om-section:not([data-module="final-expert-choice"]):not([data-module="final-promo"])'):
            section["style"] = section.get("style", "").rstrip(";") + ";background:#fff!important"
        for button in soup.select(".om-button,.om-actions a,.om-cta a"):
            button["style"] = button.get("style", "").rstrip(";") + ";border:0!important"
    for link in soup.select("a[href]"):
        parsed = urlparse(link.get("href", ""))
        source_host = (parsed.hostname or "").encode("idna").decode("ascii").lower().removeprefix("www.")
        own_hosts = {item.encode("idna").decode("ascii") for item in sites.values()}
        if source_host in own_hosts:
            link["href"] = parsed._replace(scheme="https", netloc=domain).geturl()
    for tag in soup.find_all(True):
        for attribute in list(tag.attrs):
            if (attribute == "class" or attribute in ("loading", "decoding", "role", "tabindex")
                    or attribute.startswith("aria-") or attribute.startswith("data-")):
                tag.attrs.pop(attribute, None)
    return str(soup)


def export_filename(name: str, site_key: str, brand: str = "outmax") -> str:
    """Return a domain-explicit HTML filename."""
    return f"{name}-{'hasl' if brand == 'hasl' else 'outmaxshop'}-{site_key}.html"


def local_image_export(body: str, name: str, folder: Path, product_sources: set[str] | None = None) -> tuple[str, dict[str, bytes]]:
    """Copy editorial images into image/<article>/, leaving product photos remote."""
    soup = BeautifulSoup(body, "html.parser")
    product_sources = product_sources or set()

    def is_product_image(image) -> bool:
        source = image.get("src", "").strip()
        classes = set(image.get("class", []))
        return (source in product_sources or "om-model-thumb" in classes
                or image.find_parent(class_="om-model-cell") is not None
                or image.find_parent("article", id=re.compile(r"^product-", re.I)) is not None
                or image.find_parent(class_="om-product") is not None
                or re.search(r"/(?:models|img_products)/\d+/", urlparse(source).path, re.I) is not None)

    editorial_images = [image for image in soup.select("img[src]") if not is_product_image(image)]
    sources = list(dict.fromkeys(image.get("src", "").strip() for image in editorial_images if image.get("src", "").strip()))

    def load(source: str) -> tuple[str, str, bytes]:
        parsed = urlparse(source)
        digest = hashlib.sha256(source.encode("utf-8")).hexdigest()[:10]
        stem = slug(Path(unquote(parsed.path)).stem or "image")[:45]
        if parsed.scheme in ("http", "https"):
            content, extension = download_external_image(source)
        else:
            relative = unquote(parsed.path).lstrip("/").replace("\\", "/")
            if relative.startswith("articles/"):
                relative = relative[len("articles/"):]
            for prefix in (f"{name}_files/", f"{folder.name}/"):
                if relative.startswith(prefix):
                    relative = relative[len(prefix):]
                    break
            candidate = (folder / relative).resolve()
            if not candidate.is_relative_to(folder.resolve()) or not candidate.is_file():
                raise ValueError("Локальное изображение не найдено")
            content = candidate.read_bytes()
            if len(content) > MAX_IMAGE:
                raise ValueError("Изображение больше 12 МБ")
            extension = candidate.suffix.lower()
            if extension not in (".jpg", ".jpeg", ".png", ".webp", ".gif"):
                raise ValueError("Неподдерживаемый формат изображения")
        filename = f"{stem}-{digest}{extension}"
        return source, filename, content

    loaded: dict[str, tuple[str, bytes]] = {}
    with ThreadPoolExecutor(max_workers=min(8, max(1, len(sources)))) as pool:
        futures = {pool.submit(load, source): source for source in sources}
        for future in as_completed(futures):
            try:
                source, filename, content = future.result()
                loaded[source] = (filename, content)
            except (OSError, ValueError, requests.RequestException):
                pass
    for image in editorial_images:
        item = loaded.get(image.get("src", "").strip())
        if item:
            image["src"] = f"/image/{name}/{item[0]}"
            image.attrs.pop("srcset", None)
    files = {f"image/{name}/{filename}": content for filename, content in loaded.values()}
    return str(soup), files


def export_archive(name: str, record: dict, folder: Path, site_keys: list[str], local_images: bool = False, brand: str = "outmax") -> bytes:
    """Build a ZIP with one or two domain-specific HTML variants and local assets."""
    memory = io.BytesIO()
    with zipfile.ZipFile(memory, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr(f"{name}.json", json.dumps(record, ensure_ascii=False, indent=2))
        source_body = str(record.get("body", ""))
        image_files: dict[str, bytes] = {}
        if local_images:
            product_sources = {str(source) for product in record.get("products", []) if isinstance(product, dict)
                               for source in product.get("images", []) if isinstance(source, str)}
            source_body, image_files = local_image_export(source_body, name, folder, product_sources)
        for site_key in site_keys:
            body = export_body(source_body, site_key, brand)
            archive.writestr(export_filename(name, site_key, brand), admin_document(str(record.get("title", f"Статья {brand.upper()}")), body, brand))
        for path, content in image_files.items():
            archive.writestr(path, content)
        if not local_images and folder.exists():
            for file in folder.iterdir():
                if file.is_file():
                    archive.write(file, f"{folder.name}/{file.name}")
    return memory.getvalue()


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
        query = parse_qs(urlparse(self.path).query)
        brand = query.get("brand", ["outmax"])[0]
        try:
            if path == "/api/email/fetch-image":
                content, extension = download_email_image(query.get("url", [""])[0])
                media = {".jpg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif"}[extension]
                return self.send_bytes(content, media)
            if path == "/api/drafts":
                drafts = []
                for file in sorted(ARTICLES.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True):
                    if (brand == "hasl") != file.stem.startswith("hasl--"):
                        continue
                    try:
                        item = json.loads(file.read_text(encoding="utf-8"))
                        drafts.append({"id": public_draft_id(file.stem, brand), "title": item.get("title", file.stem), "savedAt": item.get("savedAt", "")})
                    except (ValueError, OSError):
                        pass
                return self.send_json(drafts)
            if path.startswith("/api/draft/"):
                _, file, _, _ = paths(storage_name(path.rsplit("/", 1)[-1], brand))
                return self.send_bytes(file.read_bytes(), "application/json; charset=utf-8")
            if path.startswith("/api/export/"):
                public_name = slug(path.rsplit("/", 1)[-1])
                _, draft, _, folder = paths(storage_name(public_name, brand))
                name = public_name
                record = json.loads(draft.read_text(encoding="utf-8"))
                site_key = query.get("site", ["ru"])[0]
                export_format = query.get("format", ["zip"])[0]
                local_images = query.get("localImages", ["0"])[0] == "1"
                sites = brand_sites(brand)
                if site_key not in (*sites, "both"):
                    raise ValueError("Неизвестный вариант сайта")
                site_keys = list(sites) if site_key == "both" else [site_key]
                if export_format == "html":
                    if len(site_keys) != 1:
                        raise ValueError("Для двух сайтов используйте ZIP")
                    key = site_keys[0]
                    html = admin_document(str(record.get("title", f"Статья {brand.upper()}")), export_body(str(record.get("body", "")), key, brand), brand)
                    return self.send_bytes(html.encode("utf-8"), "text/html; charset=utf-8", filename=export_filename(name, key, brand))
                if export_format != "zip":
                    raise ValueError("Неизвестный формат экспорта")
                archive = export_archive(name, record, folder, site_keys, local_images, brand)
                suffix = "both" if site_key == "both" else site_key
                return self.send_bytes(archive, "application/zip", filename=f"{name}-{'hasl' if brand == 'hasl' else 'outmaxshop'}-{suffix}.zip")
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
            if path in ("/hasl", "/hasl/"): path = "/index.html"
            if path in ("/email", "/email/"): path = "/email/index.html"
            if path.startswith("/articles/"):
                candidate = (ROOT / path.lstrip("/")).resolve()
                if not candidate.is_relative_to(ARTICLES.resolve()) or not candidate.is_file():
                    raise FileNotFoundError
            elif path in ("/index.html", "/editor.css", "/editor-brand.js", "/editor-domains.js", "/editor.js", "/editor-library.js", "/editor-tools.js", "/outmax.css", "/hasl.css", "/OUTMAX.html", "/images/outmax.png", "/images/hasl.svg", "/images/hasle.png", "/vendor/jszip.min.js", "/email/index.html", "/email/email.css", "/email/email-components.css", "/email/email-renderer.js", "/email/email-controller.js"):
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
            if path == "/api/email/import-rar":
                archive = rar_to_zip(self.body(64 * 1024 * 1024))
                return self.send_bytes(archive, "application/zip")
            if path == "/api/import-bundle":
                return self.send_json(import_bundle(self.body(64 * 1024 * 1024)))
            if path == "/api/upload":
                query = parse_qs(urlparse(self.path).query)
                brand = query.get("brand", ["outmax"])[0]
                public_name = slug(query.get("draft", ["statya"])[0])
                name, _, _, folder = paths(storage_name(public_name, brand))
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
                    if candidate.read_bytes() == data:
                        return self.send_json({"src": f"{name}_files/{candidate.name}"})
                    candidate = folder / f"{stem}-{counter}{extension}"
                    counter += 1
                candidate.write_bytes(data)
                return self.send_json({"src": f"{name}_files/{candidate.name}"})
            payload = json.loads(self.body().decode("utf-8"))
            brand = payload.get("brand", "outmax")
            if path == "/api/fetch":
                sites = brand_sites(brand)
                preferred_site = sites.get(payload.get("site", "ru"), sites["ru"])
                return self.send_json(fetch_product(payload.get("value", ""), preferred_site, brand))
            if path == "/api/fetch-article":
                return self.send_json(fetch_article(payload.get("url", ""), brand))
            if path == "/api/save":
                public_name = slug(payload.get("id", "statya"))
                name, draft, html, folder = paths(storage_name(public_name, brand))
                title = str(payload.get("title", f"Статья {brand.upper()}"))[:200]
                body = str(payload.get("body", ""))
                if len(body) > 2_000_000:
                    raise ValueError("Статья слишком большая")
                body, localized_images, failed_images = localize_external_images(body, name, folder)
                products = payload.get("products", [])
                if not isinstance(products, list) or len(products) > 100:
                    raise ValueError("Слишком много товаров")
                products = [{"sku": str(item.get("sku", ""))[:12], "title": str(item.get("title", ""))[:300],
                             "url": str(item.get("url", ""))[:2000], "images": item.get("images", [])[:8],
                             "features": item.get("features", [])[:10], "price": int(item.get("price", 0) or 0),
                             "oldPrice": int(item.get("oldPrice", 0) or 0), "sizes": item.get("sizes", [])[:20],
                             "labels": item.get("labels", [])[:5], "inStock": bool(item.get("inStock"))}
                            for item in products if isinstance(item, dict)]
                record = {"id": public_name, "brand": brand, "title": title, "body": body, "products": products,
                          "savedAt": datetime.now().astimezone().isoformat(timespec="seconds")}
                draft.write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8")
                html.write_text(document(title, body, brand), encoding="utf-8")
                return self.send_json({"id": public_name, "html": f"articles/{name}.html", "savedAt": record["savedAt"],
                                       "localizedImages": localized_images, "failedImages": failed_images})
            self.send_json({"error": "Не найдено"}, 404)
        except (ValueError, requests.RequestException) as exc:
            self.send_json({"error": str(exc)}, 400)
        except Exception as exc:
            self.send_json({"error": str(exc)}, 500)


if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1", 8765), Handler)
    start_path = os.getenv("OUTMAX_START_PATH", "/")
    if start_path not in ("/", "/hasl/", "/email/"):
        start_path = "/"
    start_url = f"http://127.0.0.1:8765{start_path}"
    print(f"Редактор статей: {start_url}")
    threading.Timer(0.7, lambda: webbrowser.open(start_url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("Остановлено")
