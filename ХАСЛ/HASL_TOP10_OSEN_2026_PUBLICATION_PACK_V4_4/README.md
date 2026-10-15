# HASL TOP-10 ОСЕНЬ 2026 — Publication Pack V3

V3 пересобран **по той же структурной логике, что принятый OUTMAX V6**, но полностью в визуальной системе HASL.

## Главное
- один TOC;
- `Коротко: что выбрать`;
- экспертный `Как мы выбирали`;
- 5 scenario sections;
- в каждом scenario: H2 → expert note → editorial visual → comparison table → scroll hint → unique FULL reviews → короткие anchor references;
- без `<details>`;
- без `Другие модели` carousel;
- каждый SKU получает ровно одну FULL-card;
- FULL-card: арт. → название → горизонтальная gallery → verdict → ratings → Кому подойдёт → Почему рекомендуем → Особенности → цена/размеры → 2 CTA;
- одна итоговая таблица `Сравнить все модели`;
- финальный `Что бы выбрал эксперт`.

## HASL visual system
Dark `#07111D/#090B0D`, blue `#155FEF`, lime CTA `#C7F500`, hard geometry, radius 0–2px, no shadows/glass.

## Premiata Lauryn 47224
`MERCHANDISING_STATUS = UNRESOLVED`
`PUBLICATION_BLOCKER = TRUE`
`PUBLICATION_READY = FALSE`

Exact HASL product URL, price, sizes and gallery are not substituted from another store. Both CTA controls remain disabled without href.

## Files
- `review.html` — visual review
- `article-body.html` — CMS body, no H1/style/class/JS
- `article.md` — editorial source
- `manifest.json` — products/assets/status
- `QA.txt`, `STRUCTURE_QA.txt`
- `VISUAL_QA.txt`, `PRODUCT_FIDELITY_QA.json`
- `assets/images/` — 9 approved HASL editorial exports


## V4 — comparison tables
- Scenario tables converted from factual specification columns to Ivan-wireframe-style editorial 5-point ratings.
- Local table: `Модель | Сценарий | Сырость | Универсальность`.
- Final table: `Модель | Лучший сценарий | Комфорт | Влага | Цена / качество`.
- Score format: `N/5`.
- Premiata Lauryn price/quality remains `—` because exact HASL merchandising is unresolved.

## V4.1 — Premiata Lauryn 47224
- exact HASL URL added: `https://xn--80awro.xn--p1ai/krossovki/muzhskie/krossovki-premiata-lauryn-47224`;
- model title now links to the exact HASL page;
- primary CTA is enabled and links to that page;
- 4 gallery images added instead of empty slots;
- secondary `СМОТРЕТЬ ВСЕ PREMIATA LAURYN` remains disabled until an exact HASL family URL is supplied;
- price / sizes were not guessed from another store.

## V4.2 — языковая редактура
Пользовательский текст очищен от неуместных англицизмов. Оставлены только официальные названия брендов, моделей и технологий.

Основные замены:
- streetwear → уличный стиль;
- casual → повседневный стиль;
- low-top → низкий силуэт;
- Verdict → Кратко;
- lifestyle → повседневный;
- outdoor → для парка и грунта;
- trail в редакционном тексте → грунт / пересечённая местность;
- denim → джинсы;
- overshirt → рубашка-куртка;
- runner-inspired → в беговом стиле.

## V4.3 — промокод и финальный CTA
В конце статьи добавлен отдельный HASL promo-блок:
- промокод `ТОПОСЕНЬ`;
- дополнительная скидка `15%`;
- CTA `СМОТРЕТЬ ВСЕ КРОССОВКИ →`;
- ссылка: `https://haslestore.com/sneakers`.


## V4.4 — обновление визуалов
- Во все editorial assets подставлены новые изображения без артефактов по нижнему краю подошвы.
- Структура статьи, тексты, ссылки, промокод ТОПОСЕНЬ и финальная CTA-кнопка сохранены без изменений.
- Обновлены: 5 body visuals, desktop hero, mobile hero, miniature mobile, miniature desktop.
