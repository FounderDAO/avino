# Spec — PropertyCard в стиле Zillow: слайдер фото, бейдж «N дней», разделители «|»

**Дата:** 2026-06-26
**App-папка:** `apps/client/` (один PR)
**Связано:** PR #230–232 (компактные карточки, ADR 2026-06-26) — этот спек частично обогащает их обратно.

## Контекст

Текущая `PropertyCard` (`apps/client/src/features/search/PropertyCard.tsx`) —
минималистичная: одно статичное фото (`photos[0]`), цена, строка спеков через
`·`, локация. Заказчик сравнил с карточкой Zillow и просит приблизить подачу:
интерактивный слайдер фото, бейдж «дней на сайте», разделители «|».

Расхождения, которые закрываем (данные для всего уже есть в `Listing`):
1. Карточка показывает только `photos[0]` — нет листания. У Zillow карусель со
   стрелками `‹ ›` и точками-индикаторами.
2. Нет указателя возраста объявления. У Zillow — «158 days on Zillow».
3. Разделитель спеков `·` вместо вертикальной черты `|`.

## Цели / не-цели

**Цели:**
- Слайдер фото внутри карточки (стрелки + точки), деградирующий для 0/1 фото.
- Бейдж «N дней на сайте» из `createdAt`, заменяет нынешний «Новое».
- Разделители строки спеков `·` → `|`.

**Не-цели (YAGNI / вне границ):**
- Отдельный счётчик санузлов («3 ba») — нет поля в модели `Listing`; это
  отдельный PR в `apps/api`.
- Возврат строки агентства/автора — намеренно оставляем минимализм.
- Свайп-жесты на мобиле — точки кликабельны, этого достаточно для MVP
  (свайп — возможный follow-up).
- Изменения в `apps/web` / `apps/api` — задача строго в `apps/client`.

## Элемент 1 — `CardPhotoCarousel`

Новый изолированный компонент `apps/client/src/components/ui/card-photo-carousel.tsx`.

**Интерфейс:**
```ts
interface CardPhotoCarouselProps {
  photos: ListingPhoto[];
  alt: string;
  className?: string;
  sizes?: string; // прокидывается в PhotoImg
}
```

**Поведение:**
- State `current: number` (`useState(0)`).
- Рендерит **только текущее** фото через `PhotoImg src={photos[current]?.thumb}`
  (свап `src`, без предзагрузки всех картинок). Смена мгновенная.
- **Стрелки** `‹ ›`: показываются при `group-hover` (desktop). Клик prev/next с
  заворотом по кругу (`(current - 1 + n) % n`, `(current + 1) % n`). На клике
  обязательно `e.preventDefault()` + `e.stopPropagation()` — карточка обёрнута в
  `<Link>`, навигация не должна срабатывать (тот же приём, что у `FavButton`).
- **Точки**: снизу по центру, по одной на фото, **не более 5** (как у Zillow).
  При `photos.length > 5` рендерим 5 точек, активная — по пропорции позиции.
  Точки — `<button>` с `preventDefault`+`stopPropagation`, клик ставит индекс.
- **Деградация:** `photos.length === 0` → текущий плейсхолдер `PhotoImg('')`;
  `=== 1` → одно фото без стрелок/точек; `> 1` → полный слайдер.
- A11y: стрелки/точки — `<button>` с `aria-label` (`Предыдущее/Следующее фото`,
  `Фото N`). Вложенность кнопок в `<a>` повторяет существующий паттерн
  `FavButton` (осознанный компромисс).

`PropertyCard` заменяет блок `<PhotoImg .../>` на `<CardPhotoCarousel .../>`,
сохраняя оверлеи (бейджи слева-сверху, `FavButton` справа-сверху) поверх.

## Элемент 2 — бейдж «N дней на сайте»

- Хелпер в `lib/format.ts`:
  ```ts
  /** Сколько дней объявление на сайте (>= 0). */
  export function daysOnSite(createdAt: string): number
  ```
  `Math.max(0, Math.floor((Date.now() - Date.parse(createdAt)) / 86_400_000))`;
  для невалидной даты → `0`.
- Бейдж: белый пилюль сверху слева (как у Zillow), текст из i18n
  `units.daysOnSite` с плюралами. Компонент `DaysBadge` рядом с `NewBadge` в
  `apps/client/src/components/ui/promo-badge.tsx`.
- **Заменяет** `NewBadge`: в `PropertyCard` вместо `{fresh && ... <NewBadge/>}`
  рендерим `<DaysBadge createdAt={listing.createdAt} />` всегда. `isFresh` для
  карточки больше не нужен (импорт убрать, если не используется в другом месте).
- `PromoBadge` (VIP/TOP) сохраняется и встаёт рядом с бейджем дней.

**i18n (`messages/{ru,uz,en}.json`, неймспейс `units`):**
- ru: `"daysOnSite": "{count, plural, one {# день на сайте} few {# дня на сайте} many {# дней на сайте} other {# дней на сайте}}"`
- uz: `"daysOnSite": "{count, plural, other {# kun saytda}}"`
- en: `"daysOnSite": "{count, plural, one {# day on site} other {# days on site}}"`

## Элемент 3 — разделители «|»

В `PropertyCard` строка спеков сейчас вставляет `<span className="mx-[7px] text-border">·</span>`.
Меняем на тонкую вертикальную черту: `<span className="mx-2 inline-block h-3 w-px bg-border align-middle" aria-hidden />`
(crisp 1px-divider вместо глифа). Результат: `3-комн | 78 м² | 8/10 эт | Квартира`.

## Затрагиваемые файлы

- `apps/client/src/features/search/PropertyCard.tsx` — карусель вместо статичного
  фото, `DaysBadge` вместо `NewBadge`, `|`-разделители.
- `apps/client/src/components/ui/card-photo-carousel.tsx` — **новый** компонент.
- `apps/client/src/components/ui/promo-badge.tsx` — добавить `DaysBadge`.
- `apps/client/src/lib/format.ts` — добавить `daysOnSite()`.
- `apps/client/messages/ru.json`, `uz.json`, `en.json` — ключ `units.daysOnSite`.

## Тесты (Vitest + RTL, уже настроены)

- `card-photo-carousel`: next/prev листают с заворотом; клик по точке ставит
  индекс; стрелки/точки скрыты при `<= 1` фото; клик по стрелке не триггерит
  навигацию (вызывается `preventDefault`).
- `format`: `daysOnSite()` — корректный счёт, `0` для будущей/невалидной даты.

## Проверка готовности

- `pnpm --filter @avino/client lint` и `build` зелёные.
- `pnpm --filter @avino/client test` зелёный.
- Визуально: карточка с >1 фото листается стрелками/точками; бейдж «N дней»
  виден; спеки разделены `|`; пустое объявление (0 фото) не ломается.
