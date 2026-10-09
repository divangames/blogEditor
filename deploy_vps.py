"""Build and deploy the complete editor to the configured OUTMAX VPS."""

from __future__ import annotations

import base64
import json
import ssl
import subprocess
import sys
import zipfile
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError
import uuid

from email_fallback import EMAIL_EDITOR_ARTICLE_ID, EMAIL_EDITOR_PATH, email_editor_body
import notisend_client as notisend


ROOT = Path(__file__).resolve().parent
DEPLOY_DIR = ROOT / ".deploy"
PRIVATE_KEY = DEPLOY_DIR / "outmax_vps_ed25519"
KNOWN_HOSTS = DEPLOY_DIR / "known_hosts"
ARCHIVE = ROOT / "release" / "outmax-editor-python-hosting.zip"
PACKAGE_DIR = ROOT / "release" / "outmax-editor-python-hosting"
PATCH_ARCHIVE = ROOT / "release" / "outmax-vps-patch.zip"
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
    (EDITOR_URL + 'tiptap/', 'id="block-inspector"'),
    (EDITOR_URL + 'tiptap/app.js', 'brand-block-prototype-v2'),
    (EDITOR_URL + 'instructions/', 'id="wiki-search"'),
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
    previous = None
    try:
        request = Request(f"{EDITOR_URL}api/draft/{EMAIL_EDITOR_ARTICLE_ID}", headers={"Authorization": f"Basic {token}", "Cache-Control":"no-cache"})
        with urlopen(request, timeout=30, context=context) as response:
            previous = json.loads(response.read())
    except HTTPError as exc:
        if exc.code != 404:
            raise
    payload = json.dumps({
        "id": EMAIL_EDITOR_ARTICLE_ID,
        "title": "Редактор email-рассылок · OUTMAX / ХАСЛ",
        "body": email_editor_body(),
        "products": [],
        "expectedRevision": (previous or {}).get('revision'),
        "documentId": (previous or {}).get('documentId'),
        "requestId": str(uuid.uuid4()),
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


def configure_notisend(token: str, context: ssl.SSLContext) -> None:
    """Передать закрытые локальные настройки NotiSend на уже обновлённый VPS."""
    check = Request(f"{EDITOR_URL}editor-api/notisend/status", headers={"Authorization": f"Basic {token}"})
    with urlopen(check, timeout=30, context=context) as response:
        if json.loads(response.read().decode("utf-8")).get("connected"):
            return
    config = notisend.load_config(ROOT)
    if not config.get("api_configured"):
        raise RuntimeError("Local NotiSend API config is missing")
    payload = json.dumps({key: config.get(key) for key in (
        "api_token", "smtp_host", "smtp_port", "smtp_login", "smtp_password"
    )}, ensure_ascii=False).encode("utf-8")
    request = Request(f"{EDITOR_URL}editor-api/notisend/configure", data=payload, method="POST", headers={
        "Authorization": f"Basic {token}",
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-cache",
    })
    with urlopen(request, timeout=20, context=context) as response:
        result = json.loads(response.read().decode("utf-8"))
        if response.status != 200 or not result.get("ok"):
            raise RuntimeError("VPS did not save NotiSend configuration")


def build_vps_patch() -> Path:
    """Собрать маленький архив только из давно разрешённых deployer-ом путей."""
    files = ("wsgi_app.py", "email/index.html", "OUTMAX.html", "tmp/restart.txt")
    if PATCH_ARCHIVE.exists():
        PATCH_ARCHIVE.unlink()
    with zipfile.ZipFile(PATCH_ARCHIVE, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for relative in files:
            source = PACKAGE_DIR / relative
            if not source.is_file():
                raise RuntimeError(f"Patch file is missing: {relative}")
            archive.write(source, relative)
    return PATCH_ARCHIVE

def upload_tiptap_media(base,token,context):
    """Publish only manifest-registered immutable media, without altering bytes."""
    with zipfile.ZipFile(ROOT/'release/tiptap-prototype/server.zip') as shell:
        manifest=json.loads(shell.read('media-manifest.json'))
    completed=set()
    with zipfile.ZipFile(ROOT/'release/tiptap-prototype/media.zip') as archive:
        for name,item in manifest.items():
            digest=item['sha256']
            if digest in completed:continue
            probe=Request(f'{base}editor-api/tiptap-media/{digest}/complete',data=b'',method='POST',headers={'Authorization':'Basic '+token})
            try:
                with urlopen(probe,timeout=45,context=context) as response:
                    if response.status==200:completed.add(digest);continue
            except HTTPError as error:
                if error.code not in (400,404,409):raise
            data=archive.read(name)
            for part,offset in enumerate(range(0,len(data),262144)):
                req=Request(f'{base}editor-api/tiptap-media/{digest}/{part}',data=data[offset:offset+262144],method='POST',headers={'Authorization':'Basic '+token,'Content-Type':'application/octet-stream'})
                with urlopen(req,timeout=45,context=context) as response:
                    if response.status!=200:raise RuntimeError('Tiptap media chunk failed')
            req=Request(f'{base}editor-api/tiptap-media/{digest}/complete',data=b'',method='POST',headers={'Authorization':'Basic '+token})
            with urlopen(req,timeout=45,context=context) as response:
                if response.status!=200:raise RuntimeError('Tiptap media verification failed')
            completed.add(digest)
    print(f'Tiptap media verified: {len(completed)} original assets',flush=True)


def upload_archive(archive: Path) -> subprocess.CompletedProcess:
    """Отправить ZIP через Paramiko с жёсткой проверкой known_hosts."""
    try:
        import paramiko
    except ImportError as exc:
        raise RuntimeError("Paramiko is required for VPS deployment on Windows") from exc
    client = paramiko.SSHClient()
    client.load_host_keys(str(KNOWN_HOSTS))
    client.set_missing_host_key_policy(paramiko.RejectPolicy())
    key = paramiko.Ed25519Key.from_private_key_file(str(PRIVATE_KEY))
    try:
        client.connect(
            HOST,
            username="root",
            pkey=key,
            look_for_keys=False,
            allow_agent=False,
            timeout=20,
            banner_timeout=20,
            auth_timeout=20,
        )
        stdin, stdout, stderr = client.exec_command("deploy", timeout=120)
        with archive.open("rb") as package:
            while chunk := package.read(1024 * 1024):
                stdin.write(chunk)
        stdin.flush()
        stdin.channel.shutdown_write()
        output = stdout.read()
        errors = stderr.read()
        code = stdout.channel.recv_exit_status()
        return subprocess.CompletedProcess(["paramiko", "deploy"], code, output, errors)
    finally:
        client.close()


def deploy() -> None:
    if not PRIVATE_KEY.is_file() or not KNOWN_HOSTS.is_file():
        raise RuntimeError("VPS key files are missing from .deploy. Repeat the one-time key setup.")
    run([sys.executable, "prepare_full_deploy.py", "python"], quiet=True)
    if not ARCHIVE.is_file():
        raise RuntimeError("Could not build the VPS package")
    print(f"Uploading update to {HOST}...", flush=True)
    result = upload_archive(ARCHIVE)
    output = result.stdout.decode("utf-8", errors="replace").strip()
    debug = result.stderr.decode("utf-8", errors="replace").strip()
    if output:
        print(output)
    if debug:
        print(debug)
    if result.returncode:
        print(f"Full package SSH exit code: {result.returncode}", flush=True)
        patch = build_vps_patch()
        print(f"Full package rejected; trying compatible patch ({patch.stat().st_size} bytes)...", flush=True)
        result = upload_archive(patch)
        output = result.stdout.decode("utf-8", errors="replace").strip()
        debug = result.stderr.decode("utf-8", errors="replace").strip()
        if output:
            print(output)
        if debug:
            print(debug)
    if result.returncode:
        print(f"Patch SSH exit code: {result.returncode}", flush=True)
        raise RuntimeError("VPS rejected both full package and compatible patch")
    credentials = json.loads(CREDENTIALS.read_text(encoding="utf-8"))
    token = base64.b64encode(f'{credentials["user"]}:{credentials["password"]}'.encode()).decode()
    context = ssl.create_default_context()
    upload_tiptap_media(EDITOR_URL,token,context)
    # The server may accept HTML while a legacy fallback is still active.
    # Verify the profile API explicitly before declaring publication complete.
    profile_request = Request(f"{EDITOR_URL}editor-api/me", headers={"Authorization": f"Basic {token}"})
    with urlopen(profile_request, timeout=20, context=context) as response:
        profile = json.loads(response.read().decode("utf-8"))
        if not profile.get("admin") or not profile.get("name"):
            raise RuntimeError("Profile API is unavailable after VPS update")
    configure_notisend(token, context)
    status_request = Request(f"{EDITOR_URL}editor-api/notisend/status", headers={"Authorization": f"Basic {token}"})
    with urlopen(status_request, timeout=25, context=context) as response:
        status = json.loads(response.read().decode("utf-8"))
        if response.status != 200 or not status.get("connected"):
            raise RuntimeError("NotiSend is not connected after VPS update")
    lists_request = Request(f"{EDITOR_URL}editor-api/notisend/lists", headers={"Authorization": f"Basic {token}"})
    with urlopen(lists_request, timeout=25, context=context) as response:
        lists = json.loads(response.read().decode("utf-8"))
        if response.status != 200 or not isinstance(lists.get("items"), list):
            raise RuntimeError("NotiSend lists are unavailable after VPS update")
    login_request = Request(f"{EDITOR_URL}login")
    with urlopen(login_request, timeout=20, context=context) as response:
        if response.status != 200 or 'name="password"' not in response.read().decode("utf-8"):
            raise RuntimeError("Public login page is unavailable after VPS update")
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
