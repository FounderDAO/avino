# Дизайн — модал «Поделиться» + слайдер фото на карточках

**Дата:** 2026-06-26
**Статус:** Согласовано
**Затрагивает:** `apps/api` (поиск), `apps/client` (маппинг + UI)

## Контекст

Две задачи с публичного портала, обе по мотивам Zillow:

1. **Слайдер фото отсутствует на карточках выдачи/главной.** Диагноз: `CardPhotoCarousel`
   (PR #234) работает корректно, но получает только 1 фото. `/api/v1/search` отдаёт на
   листинг лишь обложку `thumbnail_url`, тогда как у листингов в БД по 3–5 фото
   (проверено через detail-эндпоинт). Карусель деградирует при `photos.length <= 1`
   (нет стрелок/точек) — это by design, проблема в данных.

2. **Нужен модал «Поделиться»** в стиле Zillow «Share this home» на детальной странице.

## Решения (согласованы с Team Lead)

| Вопрос | Решение |
|---|---|
| Где кнопка Share | Только детальная страница `/listing/[id]` |
| Каналы шеринга | Копировать ссылку, Telegram, WhatsApp, Email |
| Фото на карточку из search | До 3 |
| Триггер Share | Только иконка (без текста), в строке действий |
| Блок «invite your team» | НЕ делаем (Zillow-CRM для риелторов) |

## Часть 1 — Слайдер на карточках

Фича разбита на 2 PR по границам app-папок. A и B независимы (фолбэк в обе стороны):
слайдер «загорается» только когда оба смёржены.

### PR-A · `apps/api` — поиск отдаёт до 3 фото

`SEARCH_SELECT.media` уже выбирает media с `orderBy: { sortOrder: asc }`; сейчас `take: 1`.

- `search.service.ts` (~204): `media.take: 1` → `take: 3`.
- Маппер `toSearchListItem` (~811): вместо одной обложки подписать до 3 media →
  новое поле `thumbnails: string[]` (индекс 0 = обложка). `thumbnail_url` сохранить
  как `thumbnails[0] ?? null` (обратная совместимость: мобайл/прочие консьюмеры).
  Подпись R2 — локальный HMAC (не сетевой вызов), 3× на листинг дёшево.
- Тип `SearchListItem` + Swagger-DTO выдачи: добавить `thumbnails`.
- **Regen `openapi.public.json`** (`pnpm openapi:export`) — иначе CI drift-check упадёт.
- Тесты: `search.service.spec` — проверить, что возвращается до 3 подписанных URL и
  `thumbnail_url === thumbnails[0]`.

### PR-B · `apps/client` — маппинг

- `ApiSearchItem` (`lib/api/listings.ts`): добавить `thumbnails?: string[]`.
- `toPhotos()`: для search-элемента — если есть `thumbnails`, маппить все в
  `ListingPhoto[]`; иначе фолбэк на `thumbnail_url`; иначе `[]`. Detail-ветка (media[])
  без изменений.
- Карусель оживает сама (`n > 1` → стрелки/точки). UI-код карточки не трогаем.
- Тест: `listings.test.ts` — `toPhotos` мапит массив `thumbnails`.

## Часть 2 — Модал «Поделиться»

### PR-C · `apps/client` — ShareButton + ShareModal

Новый `'use client'` компонент. Detail.tsx — server component, поэтому состояние
модала живёт в дочернем клиентском компоненте (паттерн как `TourRequestModal`).

**Файлы:**
- `features/detail/ShareButton.tsx` — кнопка-иконка `Share` (lucide) + `ShareModal`
  внутри. Иконка-кнопка по стилю как `FavButton`.
- `Detail.tsx` — рендер `<ShareButton listing={listing} />` в строке действий
  (правый блок рядом с «← Назад к поиску»).

**ShareModal** (radix `Dialog`, `fade-up`, overlay z-[80]/content z-[81] — как
TourRequestModal):
- Заголовок «Поделиться этим объектом» + `Dialog.Close` (крестик).
- Превью-карточка объекта: `photos[0]` (или плейсхолдер `PhotoImg`) + цена
  (`usePriceFormatter`) + спеки (`specs` + `propertyTypeLabel`) + адрес/район.
  Без MLS-лого.
- Каналы — сетка круглых иконок-кнопок:
  - **Копировать ссылку**: `navigator.clipboard.writeText(url)` → локальный стейт
    `copied` → лейбл «Скопировано ✓» на ~2с (паттерн `done`/таймер из TourRequestModal;
    глобальных тостов в проекте нет). Fallback если clipboard недоступен — `document.execCommand` опускаем (HTTPS-only ок для прода; на http://localhost clipboard работает в Chrome для localhost).
  - **Telegram**: `https://t.me/share/url?url=<enc(url)>&text=<enc(title · price)>`.
  - **WhatsApp**: `https://wa.me/?text=<enc(title · price + '\n' + url)>`.
  - **Email**: `mailto:?subject=<enc(title)>&body=<enc(text + '\n' + url)>`.
  - Внешние каналы открываются `target="_blank" rel="noopener noreferrer"`.
- `url = window.location.href` (уже содержит локаль `/ru|/uz|/en`). Вычислять в
  effect/обработчике (не при SSR).

**i18n:** новый namespace `share` в `messages/ru.json|uz.json|en.json`:
`share.button`, `share.title`, `share.copy`, `share.copied`, `share.telegram`,
`share.whatsapp`, `share.email`, `share.close`, `share.shareText` (шаблон «{title} · {price}»).

## YAGNI / вне скоупа

- Блок «Поделиться с командой / пригласить партнёра» (Zillow-CRM).
- Соцсети сверх перечисленных (Facebook, X, QR-код).
- Share на карточках выдачи и в попапе карты.
- Native Web Share API (`navigator.share`) — можно добавить позже как прогрессивное
  улучшение для мобайла; в MVP оставляем явный список каналов.

## Проверка

- **Слайдер:** пересобрать `client` + `api`; на главной/в выдаче у листинга с ≥2 фото
  при hover видны стрелки `‹ ›` и точки; листание заворачивает по кругу; клик по
  стрелке не открывает карточку (`stopPropagation`).
- **Share:** на `/listing/[id]` иконка Share открывает модал; превью соответствует
  объекту; «Копировать» кладёт URL в буфер и показывает «Скопировано ✓»; Telegram/
  WhatsApp/Email открывают корректные deep-links с заголовком+ценой+URL.
- Тесты `pnpm --filter @avino/client test` и `pnpm --filter @avino/api test` зелёные
  (с учётом предсуществующих 2 фейлов LoginModal.test — не регресс).
