# Продолжение проекта на другом компьютере

Сохранено 7 октября 2026. Цель: редактор статей OUTMAX / ХАСЛ с качеством повседневной работы уровня Google Docs и встроенным SEO-процессом.

## Что читать Codex

1. [README](README.md) — запуск и текущие возможности.
2. [ROADMAP](ROADMAP.md) — актуальный план, архитектурные решения и критерии приёмки.
3. [TODO](TODO.md) — выполненные и следующие задачи.
4. [Проверка Tiptap](docs/TIPTAP_COMPATIBILITY.md) и [сохранённый отчёт](docs/tiptap-validation/report-2026-10-07.json).
5. [Резервное копирование и восстановление](docs/BACKUP_RESTORE.md) — утилита, состав архива и порядок проверки новой копии.

На текущем движке реализованы автосохранение, конфликты, очередь, история, снимки локальных изображений и полная резервная копия с проверкой восстановления. Следующие задачи: политика хранения/вторая копия и брендовые узлы Tiptap с проверкой совместимости. Прочитайте актуальный TODO; не повторяйте выполненную часть.

Tiptap 3.31.4 проверен на реальных публикационных пакетах обоих брендов. Текст, заголовки, src/alt изображений, JSON-восстановление и undo прошли; оформление, id и ссылочная структура потерялись. Миграция стандартными расширениями пока не подходит. Нужны брендовые узлы и проверки настоящего HTML/ZIP-экспорта; они ещё не выполнены.

## Skills: сохранённые копии и установка

Все шесть skills полностью скопированы в [tooling/codex-skills/bundled](tooling/codex-skills/bundled), включая supporting files. Снимок позволяет поставить ту же версию без доступа к GitHub. Само присутствие копий в этой папке не устанавливает их в Codex.

Из корня проекта на другом компьютере:

```powershell
# Проверка наличия, без изменений:
python tooling/codex-skills/install.py --check
# Установка отсутствующих из сохранённых копий; интернет не нужен:
python tooling/codex-skills/install.py
# Альтернатива: актуальные версии из GitHub через встроенный skill-installer:
python tooling/codex-skills/install.py --from-github
```

Скрипт использует CODEX_HOME или ~/.codex, проверяет SKILL.md и не перезаписывает существующие skills. Можно указать --dest для другого каталога. Для варианта --from-github нужен встроенный skill-installer и доступ к сети. Установленные skills доступны со следующего сообщения Codex. На текущем компьютере все шесть установлены.

Источники и назначение:

- [playwright](https://github.com/openai/skills/tree/main/skills/.curated/playwright) — браузерные проверки.
- [security-best-practices](https://github.com/openai/skills/tree/main/skills/.curated/security-best-practices) — безопасность Python/JavaScript.
- [seo-audit](https://github.com/coreyhaines31/marketingskills/tree/main/skills/seo-audit) — SEO-проверки.
- [content-strategy](https://github.com/coreyhaines31/marketingskills/tree/main/skills/content-strategy) — контент-план и ТЗ.
- [copy-editing](https://github.com/coreyhaines31/marketingskills/tree/main/skills/copy-editing) — редактура с адаптацией под русский язык.
- [schema](https://github.com/coreyhaines31/marketingskills/tree/main/skills/schema) — структурированные данные.

Машиночитаемый список: [manifest.json](tooling/codex-skills/manifest.json). Дополнительные ранее рекомендованные skills не входят в этот пакет: [emil-design-eng и break-ui](https://github.com/emilkowalski/skills), [ui-ux-pro-max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill).

## Что переносится и что остаётся локально

План, инструкция, снимки skills, установщик, отчёт и скрипт эксперимента находятся в обычных файлах проекта, не в игнорируемом release/. Они готовы к переносу через Git после коммита и push. В рамках этой задачи коммит, push и обновление VPS не выполняются.

При переносе через Git отдельно нужны реальные материалы: articles/, OUTMAX/, ZIP-пакеты, необходимые изображения и PSD. Они не гарантированно попадут в репозиторий. Не добавлять личные статьи, пароли и deploy-настройки в Git автоматически.

Полные снимки эксперимента остаются в release/tiptap-check/results/ и не попадают в Git. Для их переноса копировать эту папку отдельно либо повторить эксперимент по протоколу. Node-зависимости восстановить через сохранённый lockfile, не переносить node_modules.

Серверные документы доступны по аккаунту на том же сервере. Черновики браузерной версии GitHub Pages хранятся отдельно; для переноса использовать ZIP.

## Готовый запрос Codex на другом компьютере

> Прочитай START_HERE_CODEX.md, README.md, ROADMAP.md и TODO.md. Проверь skills командой python tooling/codex-skills/install.py --check и установи недостающие из сохранённых копий. Продолжи невыполненные задачи этапа 1 по TODO: политика хранения истории, резервное копирование и проверка полного восстановления. Базовое автосохранение и защита от конфликтов уже реализованы — сначала запусти их проверки. Сохрани прежние материалы и экспорт. Не мигрируй на Tiptap до выполнения условий docs/TIPTAP_COMPATIBILITY.md. Не сбрасывай существующие изменения и не обновляй VPS без отдельного запроса.
