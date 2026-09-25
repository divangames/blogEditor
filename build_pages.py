"""Copy the browser edition of the editor into the GitHub Pages docs folder."""

from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parent
TARGET = ROOT / "docs" / "editor"


def main() -> None:
    TARGET.mkdir(parents=True, exist_ok=True)
    for name in ("editor-domains.js", "editor.js", "editor-library.js", "editor-tools.js", "editor.css", "outmax.css", "OUTMAX.html", "online.js"):
        shutil.copy2(ROOT / name, TARGET / name)
    (TARGET / "images").mkdir(exist_ok=True)
    shutil.copy2(ROOT / "images" / "outmax.png", TARGET / "images" / "outmax.png")
    (TARGET / "vendor").mkdir(exist_ok=True)
    for name in ("jszip.min.js", "JSZip-LICENSE.markdown"):
        shutil.copy2(ROOT / "vendor" / name, TARGET / "vendor" / name)
    shutil.copytree(ROOT / "OUTMAX_files", TARGET / "OUTMAX_files", dirs_exist_ok=True)
    email_target = TARGET / "email"
    if email_target.exists():
        shutil.rmtree(email_target)
    shutil.copytree(ROOT / "email", email_target)
    screenshots = ROOT / "docs" / "screens"
    screenshots.mkdir(exist_ok=True)
    for source, target in (
        ("redactor_01.jpg", "editor-overview.jpg"),
        ("redactor_02.jpg", "product-comparison.jpg"),
        ("импорт_статьи.jpg", "article-import.jpg"),
        ("выбрать_фото_в_таблице самому.jpg", "table-photo-choice.jpg"),
        ("выбор_стиля_Р.jpg", "text-style.jpg"),
    ):
        shutil.copy2(ROOT / "images" / "screens" / source, screenshots / target)
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    for path in ("images/outmax.png", "outmax.css", "editor.css", "OUTMAX.html", "editor-domains.js", "editor.js", "editor-library.js", "editor-tools.js"):
        html = html.replace(f'"/{path}"', f'"./{path}"')
    html = html.replace('<script src="./editor-domains.js"></script>',
                        '<script src="./vendor/jszip.min.js"></script><script src="./editor-domains.js"></script><script src="./online.js"></script>')
    html = html.replace('<span id="status" aria-live="polite">Новая статья</span>',
                        '<span id="status" aria-live="polite">Онлайн · черновики в этом браузере</span>')
    html = html.replace('href="/email/"', 'href="./email/"')
    (TARGET / "index.html").write_text(html, encoding="utf-8")


if __name__ == "__main__":
    main()
