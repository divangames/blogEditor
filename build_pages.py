"""Copy the browser edition of the editor into the GitHub Pages docs folder."""

from pathlib import Path
import re
import shutil

ROOT = Path(__file__).resolve().parent
TARGET = ROOT / "docs" / "editor"


def browser_html() -> str:
    """Return the editor shell without the VPS-only server routing bootstrap."""
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    return re.sub(
        r'<script src="/vendor/jszip\.min\.js"></script>\s*'
        r'<script>window\.__EDITOR_SERVER_FIRST__=true;window\.__EDITOR_API_PREFIX__="/editor-api";</script>\s*'
        r'<script src="/online\.js\?v=\d+"></script>\s*',
        "",
        html,
        count=1,
    )


def main() -> None:
    TARGET.mkdir(parents=True, exist_ok=True)
    for name in ("editor-brand.js", "editor-domains.js", "editor.js", "editor-library.js", "editor-tools.js", "editor.css", "outmax.css", "hasl.css", "OUTMAX.html", "online.js", "editor-account.js"):
        shutil.copy2(ROOT / name, TARGET / name)
    (TARGET / "images").mkdir(exist_ok=True)
    shutil.copy2(ROOT / "images" / "outmax.png", TARGET / "images" / "outmax.png")
    shutil.copy2(ROOT / "images" / "hasl.svg", TARGET / "images" / "hasl.svg")
    shutil.copy2(ROOT / "images" / "hasle.png", TARGET / "images" / "hasle.png")
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
    html = browser_html()
    for path in ("images/outmax.png", "images/hasl.svg", "images/hasle.png", "outmax.css", "hasl.css", "editor.css", "OUTMAX.html", "editor-brand.js", "editor-domains.js", "editor.js", "editor-library.js", "editor-tools.js", "editor-account.js"):
        html = re.sub(fr'"/{re.escape(path)}([^" ]*)"', fr'"./{path}\1"', html)
    html = re.sub(r'<script src="(\./editor-domains\.js[^\"]*)"></script>',
                  r'<script src="./vendor/jszip.min.js"></script><script src="\1"></script><script src="./online.js"></script>', html)
    html = html.replace('<span id="status" aria-live="polite">Новая статья</span>',
                        '<span id="status" aria-live="polite">Онлайн · черновики в этом браузере</span>')
    html = html.replace('href="/email/"', 'href="./email/"').replace('href="/"', 'href="./"')
    (TARGET / "index.html").write_text(html, encoding="utf-8")
    hasl_target = TARGET / "hasl"
    hasl_target.mkdir(exist_ok=True)
    hasl_html = browser_html()
    for path in ("images/outmax.png", "images/hasl.svg", "images/hasle.png", "outmax.css", "hasl.css", "editor.css", "OUTMAX.html", "editor-brand.js", "editor-domains.js", "editor.js", "editor-library.js", "editor-tools.js", "editor-account.js"):
        hasl_html = re.sub(fr'"/{re.escape(path)}([^" ]*)"', fr'"../{path}\1"', hasl_html)
    hasl_html = re.sub(r'<script src="(\.\./editor-domains\.js[^\"]*)"></script>',
                       r'<script src="../vendor/jszip.min.js"></script><script src="\1"></script><script src="../online.js"></script>', hasl_html)
    hasl_html = hasl_html.replace('<span id="status" aria-live="polite">Новая статья</span>',
                                  '<span id="status" aria-live="polite">Онлайн · черновики в этом браузере</span>')
    hasl_html = hasl_html.replace('href="/email/"', 'href="../email/"').replace('href="/"', 'href="../"')
    (hasl_target / "index.html").write_text(hasl_html, encoding="utf-8")


if __name__ == "__main__":
    main()
