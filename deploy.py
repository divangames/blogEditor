"""Publish the editor source to the configured GitHub repository."""

from pathlib import Path
import os
import subprocess
import sys


ROOT = Path(__file__).resolve().parent
REMOTE = "https://github.com/divangames/blogEditor.git"
BRANCH = "main"
FILES = [
    ".gitignore",
    "app.py",
    "deploy.py",
    "pages.py",
    "build_pages.py",
    "online.js",
    "vendor",
    "index.html",
    "editor.js",
    "editor-library.js",
    "editor-tools.js",
    "editor.css",
    "outmax.css",
    "requirements.txt",
    "README.md",
    "TODO.md",
    "ROADMAP.md",
    "OUTMAX.html",
    "run.ps1",
    "editor.bat",
    "Запустить редактор.cmd",
    "Редактор OUTMAX.bat",
    "images/outmax.png",
    "images/screens/redactor_01.jpg",
    "images/screens/redactor_02.jpg",
    "images/screens/импорт_статьи.jpg",
    "images/screens/выбрать_фото_в_таблице самому.jpg",
    "images/screens/выбор_стиля_Р.jpg",
    "OUTMAX_files",
    "docs",
]
ENV = dict(os.environ, GIT_TERMINAL_PROMPT="0")


def run(*args: str, check: bool = True) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(args, cwd=ROOT, env=ENV, text=True, encoding="utf-8", errors="replace", capture_output=True)
    if check and result.returncode:
        raise RuntimeError(f"Команда {' '.join(args)} завершилась с ошибкой:\n{result.stderr or result.stdout}")
    return result


def publish() -> None:
    run(sys.executable, "build_pages.py")
    for relative in FILES:
        if not (ROOT / relative).exists():
            raise FileNotFoundError(f"Не найден файл для деплоя: {relative}")
    if not (ROOT / ".git").exists():
        run("git", "init", "-b", BRANCH)
    configured = run("git", "remote", "get-url", "origin", check=False)
    if configured.returncode:
        run("git", "remote", "add", "origin", REMOTE)
    elif configured.stdout.strip() != REMOTE:
        raise RuntimeError(f"origin указывает на другой репозиторий: {configured.stdout.strip()}")

    run("gh", "auth", "status")
    run("gh", "auth", "setup-git")
    run("git", "add", "-A", "--", *FILES)
    if run("git", "diff", "--cached", "--quiet", check=False).returncode:
        run("git", "commit", "-m", "Update OUTMAX article editor")
    remote_branch = run("git", "ls-remote", "--heads", "origin", BRANCH).stdout.strip()
    if remote_branch:
        run("git", "fetch", "origin", BRANCH)
        if run("git", "merge-base", "--is-ancestor", f"origin/{BRANCH}", "HEAD", check=False).returncode:
            print("В GitHub есть новые коммиты. Сначала синхронизируйте ветку main; принудительная перезапись запрещена.")
            raise SystemExit(2)
    run("git", "push", "-u", "origin", BRANCH)
    head = run("git", "rev-parse", "--short", "HEAD").stdout.strip()
    print(f"Опубликовано: https://github.com/divangames/blogEditor (коммит {head})")
    print("Черновики articles/ в публичный репозиторий не отправляются.")


if __name__ == "__main__":
    try:
        publish()
    except (FileNotFoundError, RuntimeError) as exc:
        print(f"Деплой не выполнен: {exc}", file=sys.stderr)
        sys.exit(1)
