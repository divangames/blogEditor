"""Собирает автономную страницу email-редактора для совместимого VPS-маршрута статей."""

from __future__ import annotations

import base64
import re
from html import escape
from pathlib import Path


ROOT = Path(__file__).resolve().parent
EMAIL_EDITOR_ARTICLE_ID = "email-editor"
EMAIL_EDITOR_PATH = f"/articles/{EMAIL_EDITOR_ARTICLE_ID}.html"


def mail_icon_data_uri() -> str:
    """Embed the dedicated email-editor icon for legacy deployers."""
    encoded = base64.b64encode((ROOT / "images" / "mail.png").read_bytes()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


def email_editor_body() -> str:
    """Вернуть тело email-редактора со встроенными стилями и сценариями."""
    page = (ROOT / "email" / "index.html").read_text(encoding="utf-8")
    match = re.search(r"<body>(.*)</body>", page, flags=re.DOTALL | re.IGNORECASE)
    if not match:
        raise ValueError("В email/index.html не найден body")
    body = match.group(1)
    body = body.replace('src="../images/mail.png"', f'src="{mail_icon_data_uri()}"')
    body = body.replace('href="../" target="_blank"', 'href="/" target="_blank"')
    body = body.replace('href="./" target="_blank"', 'href="/OUTMAX.html" target="_blank"')
    scripts = (
        ("../vendor/jszip.min.js", ROOT / "vendor" / "jszip.min.js"),
        ("./email-renderer.js", ROOT / "email" / "email-renderer.js"),
        ("./email-controller.js", ROOT / "email" / "email-controller.js"),
        ("./notisend-panel.js", ROOT / "email" / "notisend-panel.js"),
    )
    for source, path in scripts:
        body = re.sub(
            rf'<script src="{re.escape(source)}(?:\?[^\"]*)?"></script>',
            lambda _match: f"<script>\n{path.read_text(encoding='utf-8')}\n</script>",
            body,
        )
    css = "\n".join((
        "body>article{width:100%!important;max-width:none!important;margin:0!important;padding:0!important}",
        (ROOT / "email" / "email.css").read_text(encoding="utf-8"),
        (ROOT / "email" / "email-components.css").read_text(encoding="utf-8"),
        (ROOT / "email" / "notisend-panel.css").read_text(encoding="utf-8"),
    ))
    return f"<style>\n{css}\n</style>\n{body.strip()}"


def email_editor_document() -> str:
    """Вернуть полный автономный HTML-документ email-редактора."""
    title = escape("Редактор email-рассылок · OUTMAX / ХАСЛ")
    return ("<!doctype html>\n<html lang=\"ru\"><head><meta charset=\"utf-8\">"
            "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
            f'<title>{title}</title><link rel="icon" type="image/png" href="{mail_icon_data_uri()}"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;500;600;700;800&display=swap"></head><body>{email_editor_body()}</body></html>\n')
