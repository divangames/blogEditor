"""Build and deploy the complete editor to the configured OUTMAX VPS."""

from __future__ import annotations

import base64
import json
import shutil
import ssl
import subprocess
import sys
import tempfile
from pathlib import Path
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parent
DEPLOY_DIR = ROOT / ".deploy"
PRIVATE_KEY = DEPLOY_DIR / "outmax_vps_ed25519"
KNOWN_HOSTS = DEPLOY_DIR / "known_hosts"
ARCHIVE = ROOT / "release" / "outmax-editor-python-hosting.zip"
CREDENTIALS = ROOT / "release" / ".outmax-deploy-credentials.json"
HOST = "213.139.209.107"
EDITOR_URL = f"https://{HOST}/"


def run(command: list[str], quiet: bool = False) -> None:
    result = subprocess.run(command, cwd=ROOT, stdout=subprocess.PIPE if quiet else None,
                            stderr=subprocess.STDOUT if quiet else None)
    if result.returncode:
        output = result.stdout.decode("utf-8", errors="replace") if quiet and result.stdout else ""
        raise RuntimeError(f"Command failed: {' '.join(command)}\n{output}")


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
        hosts = shutil.copy2(KNOWN_HOSTS, temporary_path / "known_hosts")
        command = [
            "ssh", "-T", "-o", "BatchMode=yes", "-o", "IdentitiesOnly=yes",
            "-o", "StrictHostKeyChecking=yes", "-o", f"UserKnownHostsFile={hosts}",
            "-i", str(PRIVATE_KEY), f"root@{HOST}", "deploy",
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
    request = Request(EDITOR_URL, headers={"Authorization": f"Basic {token}", "Cache-Control": "no-cache"})
    with urlopen(request, timeout=20, context=ssl.create_default_context()) as response:
        page = response.read().decode("utf-8", errors="replace")
        if response.status != 200 or "Редактор OUTMAX" not in page:
            raise RuntimeError("VPS was updated, but the editor health check failed")
    print(f"VPS updated and verified: {EDITOR_URL}")


if __name__ == "__main__":
    try:
        deploy()
    except (OSError, RuntimeError, ValueError) as exc:
        print(f"VPS update failed: {exc}", file=sys.stderr)
        raise SystemExit(1)
