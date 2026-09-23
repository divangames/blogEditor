"""Build complete Docker and Python-hosting deployment packages for the OUTMAX editor."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import secrets
import shutil
import zipfile


ROOT = Path(__file__).resolve().parent
RELEASE = ROOT / "release"
CREDENTIALS_FILE = RELEASE / ".outmax-deploy-credentials.json"
PACKAGE_FILES = (
    "app.py",
    "wsgi_app.py",
    "requirements.txt",
    "requirements-server.txt",
    "index.html",
    "editor-domains.js",
    "editor.js",
    "editor-library.js",
    "editor-tools.js",
    "editor.css",
    "outmax.css",
    "OUTMAX.html",
    "images/outmax.png",
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
3. Откройте: http://IP_СЕРВЕРА:8765/
4. Логин: {credentials["user"]}
5. Пароль: {credentials["password"]}

Папка articles подключена как постоянный том и не пропадает при обновлении контейнера.
Для публичного домена настройте HTTPS через Nginx, Caddy или панель сервера.
Пароль можно изменить в файле .env, затем выполнить: docker compose up -d
Редактор в корне сайта открывается сразу, отдельной главной страницы нет.
""")
    return target, make_archive(target)


def build_python_hosting(credentials: dict[str, str]) -> tuple[Path, Path]:
    """Build the WSGI/Passenger and SSH Python-hosting package."""
    target = RELEASE / "outmax-editor-python-hosting"
    copy_application(target)
    write_text(target, "deploy_settings.py", f"""
# Учётные данные полного редактора на Python-хостинге.
OUTMAX_USER = {credentials["user"]!r}
OUTMAX_PASSWORD = {credentials["password"]!r}
""")
    write_text(target, "passenger_wsgi.py", """
# Точка входа Passenger/cPanel для редактора OUTMAX.
from wsgi_app import application
""")
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
3. Откройте http://АДРЕС_СЕРВЕРА:8765/

Логин: {credentials["user"]}
Пароль: {credentials["password"]}

Для публичного домена включите HTTPS в панели хостинга.
Пароль хранится в deploy_settings.py — измените его перед публичным запуском.
Редактор в корне сайта открывается сразу, отдельной главной страницы нет.

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
