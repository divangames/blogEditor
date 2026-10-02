"""Build and deploy the complete editor to the configured OUTMAX VPS."""

from __future__ import annotations

import base64
import getpass
import json
import shutil
import ssl
import subprocess
import sys
import tempfile
from pathlib import Path
from urllib.request import Request, urlopen

from email_fallback import EMAIL_EDITOR_ARTICLE_ID, EMAIL_EDITOR_PATH, email_editor_body


ROOT = Path(__file__).resolve().parent
DEPLOY_DIR = ROOT / ".deploy"
PRIVATE_KEY = DEPLOY_DIR / "outmax_vps_ed25519"
KNOWN_HOSTS = DEPLOY_DIR / "known_hosts"
ARCHIVE = ROOT / "release" / "outmax-editor-python-hosting.zip"
CREDENTIALS = ROOT / "release" / ".outmax-deploy-credentials.json"
HOST = "213.139.209.107"
EDITOR_URL = f"https://{HOST}/"
EMAIL_EDITOR_URL = f"{EDITOR_URL}OUTMAX.html"
HASL_EDITOR_URL = f"{EDITOR_URL}hasl/"
HEALTH_CHECKS = (
    (EDITOR_URL, "browserStorage:true"),
    # VPS-пакет встраивает ХАСЛ-ресурсы в HTML для совместимости со старым
    # серверным загрузчиком, который может пропускать новые имена файлов.
    (HASL_EDITOR_URL, 'id="hasl-inline-style"'),
    (EMAIL_EDITOR_URL, "Редактор email-рассылок"),
)
ARTICLE_IMPORT_CHECKS = (
    ("outmax", "https://outmaxshop.ru/article/3115-kto-pobedit-na-chm-po-futbolu-2026-prognozy", 6, 7_000),
    # Store radio controls are intentionally normalized to compact editor markup.
    ("outmax", "https://outmaxshop.ru/article/3228-top-10-krossovok-na-oktyabr-2026", 50, 110_000),
    ("hasl", "https://хасл.рф/news/top-10-krossovok-na-oktyabr-2026", 50, 130_000),
    ("hasl", "https://хасл.рф/news/chm-2026-kto-zaberet-trofey-glavnye-prognozy-i-favority-", 6, 14_000),
)


def run(command: list[str], quiet: bool = False) -> None:
    result = subprocess.run(command, cwd=ROOT, stdout=subprocess.PIPE if quiet else None,
                            stderr=subprocess.STDOUT if quiet else None)
    if result.returncode:
        output = result.stdout.decode("utf-8", errors="replace") if quiet and result.stdout else ""
        raise RuntimeError(f"Command failed: {' '.join(command)}\n{output}")


def publish_email_editor(token: str, context: ssl.SSLContext) -> None:
    """Опубликовать автономный email-редактор через постоянное хранилище VPS."""
    payload = json.dumps({
        "id": EMAIL_EDITOR_ARTICLE_ID,
        "title": "Редактор email-рассылок · OUTMAX / ХАСЛ",
        "body": email_editor_body(),
        "products": [],
    }, ensure_ascii=False).encode("utf-8")
    request = Request(f"{EDITOR_URL}api/save", data=payload, method="POST", headers={
        "Authorization": f"Basic {token}",
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-cache",
    })
    with urlopen(request, timeout=30, context=context) as response:
        result = json.loads(response.read().decode("utf-8", errors="replace"))
        if response.status != 200 or result.get("id") != EMAIL_EDITOR_ARTICLE_ID:
            raise RuntimeError("VPS did not publish the email editor page")


def deploy() -> None:
    if not PRIVATE_KEY.is_file() or not KNOWN_HOSTS.is_file():
        raise RuntimeError("VPS key files are missing from .deploy. Repeat the one-time key setup.")
    run([sys.executable, "prepare_full_deploy.py", "python"], quiet=True)
    if not ARCHIVE.is_file():
        raise RuntimeError("Could not build the VPS package")
    print(f"Uploading update to {HOST}...", flush=True)
    # Windows OpenSSH cannot reliably read key paths containing Cyrillic characters.
    with tempfile.TemporaryDirectory(prefix="outmax-deploy-") as temporary:
        temporary_path = Path(temporary)
        private_key = temporary_path / "deploy_key"
        private_key.write_bytes(PRIVATE_KEY.read_bytes().rstrip(b"\r\n") + b"\n")
        run(["icacls", str(private_key), "/inheritance:r", "/grant:r", f"{getpass.getuser()}:(R)"], quiet=True)
        hosts = shutil.copy2(KNOWN_HOSTS, temporary_path / "known_hosts")
        command = [
            "ssh", "-T", "-o", "BatchMode=yes", "-o", "IdentitiesOnly=yes",
            "-o", "StrictHostKeyChecking=yes", "-o", f"UserKnownHostsFile={hosts}",
            "-i", str(private_key), f"root@{HOST}", "deploy",
        ]
        with ARCHIVE.open("rb") as package:
            result = subprocess.run(command, cwd=ROOT, stdin=package, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    output = result.stdout.decode("utf-8", errors="replace").strip()
    if output:
        print(output)
    if result.returncode:
        raise RuntimeError("VPS rejected the update")
    credentials = json.loads(CREDENTIALS.read_text(encoding="utf-8"))
    token = base64.b64encode(f'{credentials["user"]}:{credentials["password"]}'.encode()).decode()
    context = ssl.create_default_context()
    for url, marker in HEALTH_CHECKS:
        request = Request(url, headers={"Authorization": f"Basic {token}", "Cache-Control": "no-cache"})
        with urlopen(request, timeout=20, context=context) as response:
            page = response.read().decode("utf-8", errors="replace")
            if response.status != 200 or marker not in page:
                raise RuntimeError(f"VPS was updated, but the editor health check failed: {url}")
    for brand, article_url, minimum_images, minimum_html in ARTICLE_IMPORT_CHECKS:
        payload = json.dumps({"url": article_url, "brand": brand}, ensure_ascii=False).encode("utf-8")
        request = Request(f"{EDITOR_URL}editor-api/fetch-article", data=payload, method="POST", headers={
            "Authorization": f"Basic {token}",
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-cache",
        })
        with urlopen(request, timeout=45, context=context) as response:
            result = json.loads(response.read().decode("utf-8"))
            html = result.get("html", "")
            if response.status != 200 or not result.get("title") or len(html) < minimum_html or html.count("<img") < minimum_images:
                raise RuntimeError(f"VPS article import check failed for {brand}: {article_url}")
    print(f"VPS editors updated and verified: {EDITOR_URL}, {HASL_EDITOR_URL} and {EMAIL_EDITOR_URL}")


if __name__ == "__main__":
    try:
        deploy()
    except (OSError, RuntimeError, ValueError) as exc:
        print(f"VPS update failed: {exc}", file=sys.stderr)
        raise SystemExit(1)
