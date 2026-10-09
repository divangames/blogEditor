"""Build complete Docker and Python-hosting deployment packages for the OUTMAX editor."""

from __future__ import annotations

import argparse
import base64
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import secrets
import shutil
import zipfile
import importlib.util

from email_fallback import EMAIL_EDITOR_PATH, email_editor_document


ROOT = Path(__file__).resolve().parent
RELEASE = ROOT / "release"
CREDENTIALS_FILE = RELEASE / ".outmax-deploy-credentials.json"
PACKAGE_FILES = (
    "app.py",
    "build_instructions.py",
    "article_storage.py",
    "shared_blocks.py",
    "backup_project.py",
    "wsgi_app.py",
    "requirements.txt",
    "requirements-server.txt",
    "index.html",
    "editor-brand.js",
    "editor-domains.js",
    "editor.js",
    "editor-styling.js",
    "editor-library.js",
    "editor-tools.js",
    "editor-shared-blocks.js",
    "online.js",
    "article-import-cache.json",
    "editor.css",
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
)


def deployment_credentials() -> dict[str, str]:
    """Create stable generated credentials shared by both deployment packages."""
    RELEASE.mkdir(exist_ok=True)
    if CREDENTIALS_FILE.is_file():
        saved = json.loads(CREDENTIALS_FILE.read_text(encoding="utf-8"))
        if saved.get("user") and saved.get("password"):
            return saved
    credentials = {"user": "admin", "password": secrets.token_urlsafe(18)}
    CREDENTIALS_FILE.write_text(json.dumps(credentials, indent=2), encoding="utf-8")
    return credentials


def copy_application(target: Path) -> None:
    """Copy only files required by the complete editor application."""
    resolved=target.resolve()
    if resolved==RELEASE.resolve() or not resolved.is_relative_to(RELEASE.resolve()) or target.is_symlink():
        raise ValueError('Deployment output must be a separate folder inside release')
    if target.exists():
        shutil.rmtree(target)
    target.mkdir(parents=True)
    for relative in PACKAGE_FILES:
        source = ROOT / relative
        if not source.is_file():
            raise FileNotFoundError(f"Missing package file: {relative}")
        destination = target / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, destination)
    articles = target / "articles"
    articles.mkdir()
    (articles / ".gitkeep").write_text("", encoding="utf-8")
    shutil.copytree(ROOT / 'instructions', target / 'instructions')
    inline_vps_brand_assets(target)


def inline_vps_brand_assets(target: Path) -> None:
    """Embed new ХАСЛ assets in the entry page for legacy VPS deployers.

    The restricted server-side deploy command can update existing files but may
    ignore newly introduced static filenames. Embedding keeps both editors
    functional even when those standalone assets are not copied by the host.
    """
    index_path = target / "index.html"
    html = index_path.read_text(encoding="utf-8")
    shared_script = (target / 'editor-shared-blocks.js').read_text(encoding='utf-8').replace('</script', '<\\/script')
    html = re.sub(r'<script src="/editor-shared-blocks\.js\?v=\d+"></script>', lambda _match: '<script>' + shared_script + '</script>', html, count=1)
    brand_script = (target / "editor-brand.js").read_text(encoding="utf-8").replace("</script", "<\\/script")
    online_script = (target / "online.js").read_text(encoding="utf-8").replace("</script", "<\\/script")
    hasl_css = (target / "hasl.css").read_text(encoding="utf-8").replace("</style", "<\\/style")
    logo = base64.b64encode((target / "images" / "hasle.png").read_bytes()).decode("ascii")
    article_cache = (target / "article-import-cache.json").read_text(encoding="utf-8").replace("<", "\\u003c")
    stylesheet_match = re.search(r'<link id="article-style" rel="stylesheet" href="/outmax\.css\?v=\d+">', html)
    script_match = re.search(r'<script src="/editor-brand\.js\?v=\d+"></script>', html)
    if stylesheet_match is None or script_match is None:
        raise RuntimeError("Could not locate editor brand tags in index.html")
    stylesheet_tag = stylesheet_match.group(0)
    script_tag = script_match.group(0)
    html = html.replace(
        stylesheet_tag,
        f'{stylesheet_tag}<style id="hasl-inline-style" media="not all">{hasl_css}</style>',
        1,
    )
    html = html.replace(
        script_tag,
        f'<script>window.__HASL_EMBEDDED_LOGO__="data:image/png;base64,{logo}";window.__ARTICLE_IMPORT_CACHE__={article_cache};</script><script>{brand_script}</script>',
        1,
    )
    online_match = re.search(r'<script>window\.__EDITOR_SERVER_FIRST__=true;window\.__EDITOR_API_PREFIX__="/editor-api";</script>\s*<script src="/online\.js\?v=\d+"></script>', html)
    if online_match is None:
        raise RuntimeError("Could not locate editor browser-fallback tags in index.html")
    html = html[:online_match.start()] + f'<script>window.__EDITOR_SERVER_FIRST__=true;window.__EDITOR_API_PREFIX__="/editor-api";{online_script}</script>' + html[online_match.end():]
    account_script = (ROOT / "editor-account.js").read_text(encoding="utf-8").replace("</script", "<\\/script")
    styling_script = (ROOT / 'editor-styling.js').read_text(encoding='utf-8').replace('</script','<\\/script')
    html = re.sub(r'<script src="/editor-styling\.js\?v=\d+"></script>',lambda _match:f'<script>{styling_script}</script>',html,count=1)
    html = re.sub(r'<script src="/editor-account\.js\?v=\d+"></script>', lambda _match: f'<script>{account_script}</script>', html, count=1)
    index_path.write_text(html, encoding="utf-8")

    email_path = target / "email" / "index.html"
    email_html = email_path.read_text(encoding="utf-8")
    email_html = re.sub(r'<script src="\.\./editor-styling\.js\?v=\d+"></script>',lambda _match:f'<script>{styling_script}</script>',email_html,count=1)
    mail_icon = base64.b64encode((ROOT / "images" / "mail.png").read_bytes()).decode("ascii")
    email_html = email_html.replace('../images/mail.png', f'data:image/png;base64,{mail_icon}')
    notisend_css = (ROOT / "email" / "notisend-panel.css").read_text(encoding="utf-8").replace("</style", "<\\/style")
    notisend_js = (ROOT / "email" / "notisend-panel.js").read_text(encoding="utf-8").replace("</script", "<\\/script")
    email_html = re.sub(r'<link rel="stylesheet" href="\./notisend-panel\.css\?v=\d+">', lambda _match: f'<style>{notisend_css}</style>', email_html, count=1)
    email_html = re.sub(r'<script src="\./notisend-panel\.js\?v=\d+"></script>', lambda _match: f'<script>{notisend_js}</script>', email_html, count=1)
    email_path.write_text(email_html, encoding="utf-8")

    # Legacy VPS deployment copies known filenames only. Keep newer server
    # modules inside its existing WSGI entry point as well as standalone files.
    wsgi_path = target / "wsgi_app.py"
    wsgi_source = wsgi_path.read_text(encoding="utf-8")
    spec=importlib.util.spec_from_file_location('tiptap_package_builder',ROOT/'experiments/tiptap-editor/package_server.py')
    builder=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(builder)
    tiptap_bundle=base64.b64encode(builder.build_bundle()).decode('ascii')
    if 'TIPTAP_BUNDLE = ""' not in wsgi_source:
        raise RuntimeError('Could not locate Tiptap bundle placeholder')
    wsgi_source=wsgi_source.replace('TIPTAP_BUNDLE = ""',f'TIPTAP_BUNDLE = {tiptap_bundle!r}',1)
    storage_source = (ROOT / 'article_storage.py').read_text(encoding='utf-8-sig')
    embedded_storage = ("import sys as _storage_sys, types as _storage_types\n"
                        "_storage_module = _storage_types.ModuleType('article_storage')\n"
                        f"exec({storage_source!r}, _storage_module.__dict__)\n"
                        "_storage_sys.modules['article_storage'] = _storage_module\n"
                        "import app as core")
    wsgi_source = wsgi_source.replace('import app as core', embedded_storage, 1)
    shared_source = (ROOT / 'shared_blocks.py').read_text(encoding='utf-8-sig')
    shared_bootstrap = ("_shared_module = _storage_types.ModuleType('shared_blocks')\n"
                        f"exec({shared_source!r}, _shared_module.__dict__)\n"
                        "_storage_sys.modules['shared_blocks'] = _shared_module\n"
                        "import app as core")
    wsgi_source = wsgi_source.replace('import app as core', shared_bootstrap, 1)
    notisend_source = (ROOT / "notisend_client.py").read_text(encoding="utf-8-sig")
    if "import notisend_client as notisend" not in wsgi_source:
        raise RuntimeError("Could not locate NotiSend client import in WSGI")
    embedded_client = ("import types as _notisend_types\n"
                       "notisend = _notisend_types.ModuleType('notisend_embedded')\n"
                       f"exec({notisend_source!r}, notisend.__dict__)")
    wsgi_source = wsgi_source.replace("import notisend_client as notisend", embedded_client, 1)
    account_source = (ROOT / "accounts.py").read_text(encoding="utf-8-sig")
    feedback_source = (ROOT / "preview_feedback.py").read_text(encoding="utf-8-sig")
    account_source = account_source.replace("from preview_feedback import install_feedback, feedback_page, feedback_document", feedback_source)
    wsgi_source = wsgi_source.replace("from accounts import install_accounts", account_source)
    import hashlib
    email_assets = {hashlib.sha256(path.read_bytes()).hexdigest()+path.suffix.lower():base64.b64encode(path.read_bytes()).decode('ascii') for path in (ROOT/'images'/'email').glob('*') if path.is_file() and path.suffix.lower() in ('.png','.gif')}
    wsgi_source = wsgi_source.replace('EMAIL_BRAND_ASSET_DATA = {}', 'EMAIL_BRAND_ASSET_DATA = '+repr(email_assets), 1)
    template_pages={path.name:path.read_text(encoding='utf-8') for path in (ROOT/'email'/'templates').glob('*.html') if path.is_file()}
    wsgi_source=wsgi_source.replace('EMAIL_TEMPLATE_PAGES = {}','EMAIL_TEMPLATE_PAGES = '+repr(template_pages),1)
    from build_instructions import build as build_instructions
    instruction_assets = {'index.html': base64.b64encode(build_instructions().encode('utf-8')).decode('ascii')}
    instruction_assets.update({'screens/' + path.name: base64.b64encode(path.read_bytes()).decode('ascii') for path in (ROOT / 'instructions' / 'screens').glob('*.png')})
    wsgi_source = wsgi_source.replace('INSTRUCTIONS_ASSETS = {}', 'INSTRUCTIONS_ASSETS = ' + repr(instruction_assets), 1)
    wsgi_path.write_text(wsgi_source, encoding="utf-8")

    app_path = target / "app.py"
    app_source = app_path.read_text(encoding="utf-8")
    css_placeholder = 'EMBEDDED_HASL_CSS = ""'
    if css_placeholder not in app_source:
        raise RuntimeError("Could not locate embedded ХАСЛ CSS placeholder in app.py")
    app_source = app_source.replace(css_placeholder, f"EMBEDDED_HASL_CSS = {hasl_css!r}", 1)
    app_path.write_text(app_source, encoding="utf-8")


def write_text(target: Path, relative: str, content: str) -> None:
    """Write one UTF-8 deployment configuration file."""
    path = target / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content.strip() + "\n", encoding="utf-8", newline="\n")


def make_archive(folder: Path) -> Path:
    """Create a ZIP with package files directly at the archive root."""
    archive_path = folder.with_suffix(".zip")
    if archive_path.exists():
        archive_path.unlink()
    with zipfile.ZipFile(archive_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for path in sorted(folder.rglob("*")):
            if path.is_file():
                archive.write(path, path.relative_to(folder))
    return archive_path


def build_docker(credentials: dict[str, str]) -> tuple[Path, Path]:
    """Build the VPS/Docker package."""
    target = RELEASE / "outmax-editor-docker"
    copy_application(target)
    write_text(target, "Dockerfile", """
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends libarchive-tools && rm -rf /var/lib/apt/lists/*
COPY requirements-server.txt requirements.txt ./
RUN pip install --no-cache-dir -r requirements-server.txt
COPY . .
EXPOSE 8765
CMD ["gunicorn", "--bind", "0.0.0.0:8765", "--workers", "2", "--threads", "4", "--timeout", "120", "wsgi_app:application"]
""")
    write_text(target, "compose.yaml", """
services:
  editor:
    build: .
    restart: unless-stopped
    env_file: .env
    ports:
      - "${OUTMAX_PORT:-8765}:8765"
    volumes:
      - ./articles:/app/articles
""")
    write_text(target, ".dockerignore", """
articles/*
!articles/.gitkeep
__pycache__/
*.pyc
*.zip
""")
    write_text(target, ".env", f"""
OUTMAX_USER={credentials["user"]}
OUTMAX_PASSWORD={credentials["password"]}
OUTMAX_PORT=8765
""")
    write_text(target, "README-RU.txt", f"""
ПОЛНЫЙ РЕДАКТОР OUTMAX — VPS / DOCKER

1. Загрузите содержимое этой папки на VPS.
2. В каталоге выполните: docker compose up -d --build
3. Редактор статей: http://IP_СЕРВЕРА:8765/
4. Редактор email-рассылок: http://IP_СЕРВЕРА:8765/email/
5. Логин: {credentials["user"]}
6. Пароль: {credentials["password"]}

Папка articles подключена как постоянный том и не пропадает при обновлении контейнера.
Для публичного домена настройте HTTPS через Nginx, Caddy или панель сервера.
Пароль можно изменить в файле .env, затем выполнить: docker compose up -d
Редактор статей открывается в корне сайта, email-редактор — по адресу /email/.
""")
    return target, make_archive(target)


def build_python_hosting(credentials: dict[str, str]) -> tuple[Path, Path]:
    """Build the WSGI/Passenger and SSH Python-hosting package."""
    target = RELEASE / "outmax-editor-python-hosting"
    copy_application(target)
    index = target / "index.html"
    index.write_text(index.read_text(encoding="utf-8").replace('href="/email/"', 'href="/OUTMAX.html"'), encoding="utf-8")
    write_text(target, EMAIL_EDITOR_PATH.lstrip("/"), email_editor_document())
    # The restricted legacy deployer preserves articles/ and cannot update the
    # old email page there. OUTMAX.html is an existing updatable static route.
    write_text(target, "OUTMAX.html", email_editor_document())
    write_text(target, "deploy_settings.py", f"""
# Учётные данные полного редактора на Python-хостинге.
OUTMAX_USER = {credentials["user"]!r}
OUTMAX_PASSWORD = {credentials["password"]!r}
""")
    write_text(target, "passenger_wsgi.py", """
# Точка входа Passenger/cPanel для редактора OUTMAX.
from wsgi_app import application
""")
    write_text(target, "tmp/restart.txt", datetime.now(timezone.utc).isoformat(timespec="seconds"))
    write_text(target, "run_server.py", """
# Запуск полного редактора на Python-хостинге с SSH.
import os
from waitress import serve
from wsgi_app import application

serve(application, host=os.getenv("OUTMAX_HOST", "0.0.0.0"), port=int(os.getenv("OUTMAX_PORT", "8765")))
""")
    write_text(target, ".htaccess.example", """
# Если хостинг использует Apache Passenger, укажите реальные абсолютные пути:
# PassengerEnabled On
# PassengerAppRoot /home/USER/outmax-editor
# PassengerPython /home/USER/virtualenv/outmax-editor/bin/python
# PassengerAppType wsgi
# PassengerStartupFile passenger_wsgi.py
""")
    write_text(target, "README-RU.txt", f"""
ПОЛНЫЙ РЕДАКТОР OUTMAX — PYTHON-ХОСТИНГ

Требования: Python 3.10+, возможность запустить WSGI/Passenger или постоянный Python-процесс,
исходящие HTTPS-запросы к outmaxshop.ru и outmaxshop.com, запись в папку articles.

Вариант панели cPanel/Passenger:
1. Загрузите содержимое папки в каталог приложения.
2. Создайте Python Application, корень приложения — этот каталог.
3. Startup file: passenger_wsgi.py
4. Entry point: application
5. Установите зависимости: pip install -r requirements-server.txt
6. Перезапустите приложение в панели.

Вариант SSH:
1. pip install -r requirements-server.txt
2. python run_server.py
3. Редактор статей: http://АДРЕС_СЕРВЕРА:8765/
4. Редактор email-рассылок: http://АДРЕС_СЕРВЕРА:8765/email/

Логин: {credentials["user"]}
Пароль: {credentials["password"]}

Для публичного домена включите HTTPS в панели хостинга.
Пароль хранится в deploy_settings.py — измените его перед публичным запуском.
Редактор статей открывается в корне сайта, email-редактор — по адресу /email/.

Если тариф разрешает только PHP или статические файлы, этот пакет запустить нельзя:
нужен тариф с Python WSGI/Passenger либо VPS.
""")
    return target, make_archive(target)


def report(label: str, folder: Path, archive: Path) -> None:
    """Print generated artifact paths and basic package statistics."""
    files = sum(path.is_file() for path in folder.rglob("*"))
    print(f"{label}:")
    print(f"  Folder:  {folder}")
    print(f"  Archive: {archive}")
    print(f"  Files:   {files}; ZIP: {archive.stat().st_size / (1024 * 1024):.2f} MB")


def main() -> None:
    """Build the selected complete deployment package or both packages."""
    parser = argparse.ArgumentParser()
    parser.add_argument("variant", choices=("docker", "python", "both"), nargs="?", default="both")
    args = parser.parse_args()
    credentials = deployment_credentials()
    built = []
    if args.variant in ("docker", "both"):
        built.append(("Docker / VPS", *build_docker(credentials)))
    if args.variant in ("python", "both"):
        built.append(("Python hosting", *build_python_hosting(credentials)))
    print()
    for package in built:
        report(*package)
    print()
    print(f"Editor login: {credentials['user']}")
    print(f"Editor password: {credentials['password']}")
    print("Keep these credentials private and enable HTTPS on the public domain.")


if __name__ == "__main__":
    main()
