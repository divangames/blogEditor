"""Build the static OUTMAX project page from main/docs on GitHub Pages."""

import json
import subprocess
import sys
import time
from pathlib import Path
from urllib.error import URLError
from urllib.request import Request, urlopen


REPO = "divangames/blogEditor"
PAGES = f"repos/{REPO}/pages"
ROOT = Path(__file__).resolve().parent
LOCAL_PAGE = ROOT / "docs" / "index.html"
SAFE_DIRECTORY = ROOT.as_posix()


def gh(*args: str, check: bool = True):
    result = subprocess.run(("gh", "api", *args), text=True, encoding="utf-8", errors="replace",
                            capture_output=True)
    if check and result.returncode:
        raise RuntimeError(result.stderr.strip() or result.stdout.strip())
    return result


def ensure_github_auth() -> None:
    if subprocess.run(("gh", "auth", "status"), text=True, capture_output=True).returncode == 0:
        return
    print("Вход в GitHub устарел. Откроется браузер для повторной авторизации.", flush=True)
    result = subprocess.run(("gh", "auth", "login", "--hostname", "github.com", "--git-protocol", "https", "--web"),
                            cwd=ROOT)
    if result.returncode or subprocess.run(("gh", "auth", "status"), text=True, capture_output=True).returncode:
        raise RuntimeError("Не удалось войти в GitHub. Повторите пункт меню и завершите вход в браузере.")


def main():
    remote = subprocess.run(("git", "-c", f"safe.directory={SAFE_DIRECTORY}", "ls-remote", "origin", "refs/heads/main"), cwd=ROOT, text=True,
                            encoding="utf-8", errors="replace", capture_output=True)
    if remote.returncode or not remote.stdout.strip():
        raise RuntimeError("Cannot read origin/main. Push changes first (menu item 2 or 4).")
    expected_commit = remote.stdout.split()[0]
    ensure_github_auth()
    site = gh(PAGES, check=False)
    if site.returncode:
        if "404" not in site.stderr and "Not Found" not in site.stdout:
            raise RuntimeError(site.stderr.strip() or site.stdout.strip())
        print("GitHub Pages is not configured. Creating main/docs site...", flush=True)
        site = gh("-X", "POST", PAGES, "-f", "source[branch]=main", "-f", "source[path]=/docs")
    settings = json.loads(site.stdout)
    source = settings.get("source") or {}
    if source.get("branch") != "main" or source.get("path") != "/docs":
        raise RuntimeError("GitHub Pages uses another source. Expected main/docs; existing settings were not changed.")
    latest = gh(f"{PAGES}/builds/latest", check=False)
    current = json.loads(latest.stdout) if latest.returncode == 0 else {}
    if current.get("commit") == expected_commit and current.get("status") in ("queued", "building"):
        print("A Pages build for this commit is already running...", flush=True)
    else:
        print("Requesting GitHub Pages build...", flush=True)
        result = gh("-X", "POST", f"{PAGES}/builds", check=False)
        if result.returncode and "409" not in result.stderr:
            raise RuntimeError(result.stderr.strip() or result.stdout.strip())
    url = settings.get("html_url") or "https://divangames.github.io/blogEditor/"
    for attempt in range(120):
        time.sleep(5)
        try:
            request = Request(f"{url}?check={expected_commit[:12]}", headers={"Cache-Control": "no-cache"})
            with urlopen(request, timeout=10) as response:
                if response.read() == LOCAL_PAGE.read_bytes():
                    print(f"Page updated and verified: {url}")
                    return
        except (OSError, URLError):
            pass
        latest = gh(f"{PAGES}/builds/latest", check=False)
        if latest.returncode:
            continue
        build = json.loads(latest.stdout)
        status = build.get("status", "unknown")
        if build.get("commit") != expected_commit:
            print("Waiting for Pages build of the latest commit...", flush=True)
            continue
        print(f"Pages build: {status}", flush=True)
        if status == "built":
            print(f"Page updated: {url}")
            return
        if status == "errored":
            raise RuntimeError(f"GitHub Pages build failed: {build.get('error', {})}")
    raise RuntimeError(f"Build is still in progress after 10 minutes. Check {url} or GitHub Pages settings.")


if __name__ == "__main__":
    try:
        main()
    except RuntimeError as exc:
        print(f"Pages update failed: {exc}", file=sys.stderr)
        sys.exit(1)
