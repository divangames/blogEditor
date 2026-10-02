"""Безопасный серверный клиент NotiSend для email-редактора."""

from __future__ import annotations

import os
import re
from pathlib import Path
from typing import Any

import requests

BASE_URL = "https://api.notisend.ru/v1"
TIMEOUT = 25


class NotiSendError(RuntimeError):
    """Ошибка соединения или ответа NotiSend."""


def _value(text: str, label: str) -> str:
    match = re.search(rf"(?im)^{re.escape(label)}\s*:\s*([^\r\n]+)", text)
    return match.group(1).strip() if match else ""


def load_config(root: Path) -> dict[str, Any]:
    """Читает секреты из окружения, затем из локального игнорируемого файла."""
    config = {
        "api_token": os.getenv("NOTISEND_API_TOKEN", "").strip(),
        "smtp_host": os.getenv("NOTISEND_SMTP_HOST", "").strip(),
        "smtp_port": int(os.getenv("NOTISEND_SMTP_PORT", "587") or 587),
        "smtp_login": os.getenv("NOTISEND_SMTP_LOGIN", "").strip(),
        "smtp_password": os.getenv("NOTISEND_SMTP_PASSWORD", "").strip(),
    }
    candidates = (
        root / "release" / "notisend.txt",
        root / ".notisend.txt",
        root / "articles" / "_accounts" / "notisend.txt",
        root / "notisend.txt",
    )
    source = next((item for item in candidates if item.is_file()), None)
    if source:
        text = source.read_text(encoding="utf-8-sig", errors="replace")
        config["api_token"] = config["api_token"] or _value(text, "Ключ")
        config["smtp_host"] = config["smtp_host"] or _value(text, "Адрес")
        config["smtp_login"] = config["smtp_login"] or _value(text, "Логин")
        config["smtp_password"] = config["smtp_password"] or _value(text, "Пароль")
    config["smtp_configured"] = bool(
        config["smtp_host"] and config["smtp_login"] and config["smtp_password"]
    )
    config["api_configured"] = bool(config["api_token"])
    return config


def save_config(root: Path, data: dict[str, Any]) -> None:
    """Сохраняет закрытый серверный конфиг NotiSend вне публичных маршрутов."""
    values = {
        "api_token": str(data.get("api_token") or "").strip(),
        "smtp_host": str(data.get("smtp_host") or "").strip(),
        "smtp_port": int(data.get("smtp_port") or 587),
        "smtp_login": str(data.get("smtp_login") or "").strip(),
        "smtp_password": str(data.get("smtp_password") or "").strip(),
    }
    if not values["api_token"]:
        raise NotiSendError("API-ключ NotiSend не указан")
    content = (
        f"API Подключение:\nКлюч: {values['api_token']}\n\n"
        f"SMTP подключение:\nАдрес: {values['smtp_host']}\n"
        f"Порт: {values['smtp_port']}\nЛогин: {values['smtp_login']}\n"
        f"Пароль: {values['smtp_password']}\n"
    )
    target = root / "articles" / "_accounts" / "notisend.txt"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8", newline="\n")


def _error_detail(response: requests.Response) -> str:
    try:
        payload = response.json()
    except ValueError:
        return (response.text or "Неизвестная ошибка NotiSend")[:500]
    errors = payload.get("errors") if isinstance(payload, dict) else None
    if isinstance(errors, list) and errors:
        return "; ".join(
            str(item.get("detail") or item.get("code") or item) for item in errors[:3]
        )
    if isinstance(payload, dict):
        return str(payload.get("error") or payload.get("message") or payload)[:500]
    return str(payload)[:500]


def api_request(
    root: Path,
    method: str,
    path: str,
    *,
    params: dict[str, Any] | None = None,
    payload: dict[str, Any] | None = None,
) -> Any:
    """Выполняет один авторизованный запрос, не раскрывая API-ключ наружу."""
    config = load_config(root)
    if not config["api_configured"]:
        raise NotiSendError("API NotiSend не настроен")
    headers = {
        "Authorization": f"Bearer {config['api_token']}",
        "Accept": "application/json",
        "Content-Type": "application/json",
    }
    try:
        response = requests.request(
            method,
            f"{BASE_URL}{path}",
            headers=headers,
            params=params,
            json=payload,
            timeout=TIMEOUT,
        )
    except requests.RequestException as exc:
        raise NotiSendError("Не удалось подключиться к NotiSend") from exc
    if not response.ok:
        raise NotiSendError(_error_detail(response))
    if not response.content:
        return {}
    try:
        return response.json()
    except ValueError as exc:
        raise NotiSendError("NotiSend вернул некорректный JSON") from exc


def status(root: Path) -> dict[str, Any]:
    """Проверяет API и возвращает только безопасные данные подключения."""
    config = load_config(root)
    if not config["api_configured"]:
        return {"connected": False, "smtpConfigured": config["smtp_configured"]}
    balance = api_request(root, "GET", "/email/balance")
    tariff = balance.get("tariff") if isinstance(balance, dict) else {}
    subscribers = tariff.get("subscribers") if isinstance(tariff, dict) else {}
    return {
        "connected": True,
        "smtpConfigured": config["smtp_configured"],
        "subscriberTotal": subscribers.get("total"),
        "subscriberAvailable": subscribers.get("available"),
        "credits": tariff.get("credits") if isinstance(tariff, dict) else None,
        "balance": balance.get("balance") if isinstance(balance, dict) else None,
    }


def lists(root: Path) -> list[dict[str, Any]]:
    """Возвращает группы получателей без адресов подписчиков."""
    result = api_request(root, "GET", "/email/lists", params={"page_size": 100})
    items = result.get("collection", []) if isinstance(result, dict) else []
    return [
        {"id": item.get("id"), "title": str(item.get("title") or "Без названия")}
        for item in items
    ]


def _campaign_summary(item: dict[str, Any]) -> dict[str, Any]:
    statistics = item.get("statistics") if isinstance(item.get("statistics"), dict) else {}
    return {
        "id": item.get("id"),
        "subject": str(item.get("subject") or "Без темы"),
        "fromEmail": item.get("from_email"),
        "fromName": item.get("from_name"),
        "state": item.get("state"),
        "recipientsCount": item.get("recipients_count") or 0,
        "sentAt": item.get("sent_at"),
        "startAt": item.get("start_at"),
        "timeZone": item.get("time_zone"),
        "statistics": {
            "delivered": statistics.get("delivered") or 0,
            "bounced": statistics.get("bounced") or 0,
            "delivering": statistics.get("delivering") or 0,
            "uniqOpen": statistics.get("uniq_open") or 0,
            "totalOpen": statistics.get("total_open") or 0,
            "uniqClick": statistics.get("uniq_click") or 0,
            "totalClick": statistics.get("total_click") or 0,
            "unsubscription": statistics.get("unsubscription") or 0,
            "spam": statistics.get("spam") or 0,
            "lastOpenAt": statistics.get("last_open_at"),
            "lastClickAt": statistics.get("last_click_at"),
        },
    }


def campaigns(root: Path, page_size: int = 25) -> dict[str, Any]:
    """Возвращает последние кампании в компактном формате."""
    result = api_request(
        root,
        "GET",
        "/email/campaigns",
        params={"page_size": min(max(page_size, 1), 100), "statistic": "true"},
    )
    collection = result.get("collection", []) if isinstance(result, dict) else []
    return {
        "totalCount": result.get("total_count", len(collection)),
        "items": [_campaign_summary(item) for item in collection],
    }


def create_campaign(root: Path, data: dict[str, Any]) -> dict[str, Any]:
    """Создаёт только черновик кампании. Отправка выполняется отдельно."""
    list_ids = [str(value) for value in data.get("listIds", []) if str(value).strip()]
    if not list_ids:
        raise NotiSendError("Выберите хотя бы одну группу получателей")
    payload = {
        "from_email": str(data.get("fromEmail") or "").strip(),
        "from_name": str(data.get("fromName") or "").strip() or None,
        "subject": str(data.get("subject") or "").strip(),
        "html": str(data.get("html") or ""),
        "text": str(data.get("text") or "").strip(),
        "lists": [{"id": value} for value in list_ids],
    }
    if not payload["from_email"] or not payload["subject"] or not payload["html"]:
        raise NotiSendError("Заполните отправителя, тему и HTML письма")
    result = api_request(root, "POST", "/email/campaigns", payload=payload)
    return _campaign_summary(result)
