# Дизайн: страницы «Правила сервиса» и «Политика конфиденциальности»

- **Дата:** 2026-06-29
- **App-папка:** `apps/client` (публичный портал) — одна папка, без правок `apps/web`/`apps/api`
- **Статус:** одобрено к реализации

## 1. Задача

Создать для Avino две публичные юридические страницы по образцу OLX.uz:
- **Правила сервиса** (оферта/пользовательское соглашение классифайда недвижимости);
- **Политика конфиденциальности** (под закон РУз «О персональных данных» № ЗРУ-547).

Сейчас футер (`apps/client/src/components/layout/Footer.tsx`) уже содержит ярлыки
`footer.terms` / `footer.privacy`, но они ведут на заглушку `/help`.

## 2. Решения (зафиксировано с Team Lead)

| Развилка | Решение |
|----------|---------|
| Формат | Готовые рендер-страницы в `apps/client` + перевязка ссылок футера |
| Языки | uz / ru / en сразу (полный перевод всех разделов) |
| Реквизиты юрлица | Плейсхолдер-токены в тексте; реальные контакты из кода подставить как есть |
| Хранение текста | **Подход C (гибрид):** UI-каркас в i18n, тело — per-locale data-модули |

## 3. Почему Подход C, а не i18n-ключи

`messages/${locale}.json` грузится next-intl **на каждой странице** портала
(`apps/client/src/i18n/request.ts` импортирует весь файл). Полный текст двух
документов на трёх языках — это ~80–120 КБ, которые иначе поехали бы в глобальный
бандл всех страниц. Поэтому длинный юридический текст хранится отдельными
per-locale модулями и подгружается только на роутах `/legal/*`. В `messages/*.json`
остаётся лишь мелкий каркас (заголовки вкладки, «обновлено», «содержание»).

MDX в проекте не настроен → используем типизированные TS data-модули + общий
React-рендер (без нового тулинга).

## 4. Архитектура

### Роуты
- `/[locale]/legal/terms` — Правила сервиса
- `/[locale]/legal/privacy` — Политика конфиденциальности

### Файлы
```
apps/client/src/app/[locale]/legal/terms/page.tsx       server + generateMetadata + alternatesFor('/legal/terms')
apps/client/src/app/[locale]/legal/privacy/page.tsx      server + generateMetadata + alternatesFor('/legal/privacy')
apps/client/src/features/legal/LegalDocument.tsx         общий рендер: H1, дата, оглавление, секции
apps/client/src/content/legal/types.ts                   модель LegalDoc / LegalSection / LegalBlock
apps/client/src/content/legal/terms.ru.ts                контент Правил (ru)
apps/client/src/content/legal/terms.uz.ts                контент Правил (uz)
apps/client/src/content/legal/terms.en.ts                контент Правил (en)
apps/client/src/content/legal/privacy.ru.ts              контент Политики (ru)
apps/client/src/content/legal/privacy.uz.ts              контент Политики (uz)
apps/client/src/content/legal/privacy.en.ts              контент Политики (en)
apps/client/src/content/legal/index.ts                   getLegalDoc(kind, locale) -> LegalDoc
apps/client/src/components/layout/Footer.tsx             href /help -> /legal/terms | /legal/privacy
apps/client/messages/ru.json                             +namespace legal (каркас)
apps/client/messages/uz.json                             +namespace legal (каркас)
apps/client/messages/en.json                             +namespace legal (каркас)
apps/client/src/features/legal/LegalDocument.test.tsx    Vitest+RTL (лёгкий)
```

### Модель контента (`content/legal/types.ts`)
```ts
export type LegalBlock =
  | { type: 'p'; text: string }          // абзац (может содержать плейсхолдер-токены)
  | { type: 'list'; items: string[] }    // маркированный список
  | { type: 'subheading'; text: string } // подзаголовок внутри секции (H3)

export interface LegalSection {
  id: string;          // стабильный slug-якорь, ОДИНАКОВЫЙ для всех языков
  heading: string;     // локализованный заголовок секции (H2)
  blocks: LegalBlock[];
}

export interface LegalDoc {
  title: string;            // локализованный H1
  updatedAt: string;        // ISO-дата, одна для всех языков
  intro?: string;           // опциональный лид-абзац
  sections: LegalSection[]; // упорядоченные секции
}
```

`id` секций стабильны и общие для языков — переключение языка сохраняет якорь
(`#section-id`) и работающее оглавление.

### Загрузчик (`content/legal/index.ts`)
```ts
type LegalKind = 'terms' | 'privacy';
export function getLegalDoc(kind: LegalKind, locale: Locale): LegalDoc { ... }
```
Резолвит per-locale модуль; фолбэк на `ru` для неизвестной локали.

### Рендер (`features/legal/LegalDocument.tsx`)
- Хлебные крошки (на главную) → H1 `title`
- «Последнее обновление: {updatedAt}» — дата форматируется по локали страницы
  (`Intl.DateTimeFormat(locale, { dateStyle: 'long' })`)
- Оглавление по `sections` (липкий сайдбар на desktop / свёртка на mobile),
  якорные ссылки `#${id}`
- Секции: `<section id={id}>` → H2 `heading` → блоки (`p` / `ul>li` / H3)
- Стиль — существующие Tailwind-токены (паттерн страницы Help)

### i18n-каркас (namespace `legal`, мелкий)
```
legal.meta.terms.title / .description
legal.meta.privacy.title / .description
legal.updatedLabel            «Последнее обновление»
legal.toc                     «Содержание»
legal.breadcrumbHome          «Главная»
```
Ярлыки `footer.terms` / `footer.privacy` уже есть — меняем только href в `COLS`.

## 5. Состав документов

### Правила сервиса (адаптировано под классифайд недвижимости)
1. Общие положения, термины, акцепт оферты, кто оператор
2. Регистрация и аккаунт; роли (USER/OWNER/AGENT/AGENCY/LANDLORD/…); способы входа
   (телефон-SMS, Google, Apple, Telegram)
3. Размещение объявлений и модерация (NEW → ACTIVE/REJECTED/DRAFT, автоперевод, статусы)
4. Запрещённый контент и поведение (фейки, дубли, запрещённые товары/услуги, спам)
5. Платные услуги продвижения (VIP/TOP/promotions; сейчас за feature-flag — оферта на будущее)
6. Чат и коммуникации (внутренний чат, правила общения, запрет спама/мошенничества)
7. Права на контент и лицензия (пользователь гарантирует права на фото/текст; лицензия
   Avino на показ и автоперевод)
8. Ответственность сторон (площадка-посредник, не сторона сделки, не гарантирует
   достоверность; рекомендации по безопасной сделке)
9. Интеллектуальная собственность Avino; запрет скрейпинга/копирования базы
10. Блокировка и удаление аккаунта/объявлений
11. Изменение Правил
12. Применимое право и разрешение споров (Узбекистан)
13. Реквизиты и контакты

### Политика конфиденциальности (под ЗРУ-547)
1. Общие положения; оператор; что регулирует; согласие
2. Какие данные собираем: учётные (телефон, email, имя); данные входа Google/Apple/
   Telegram; объявления и их гео-координаты; сообщения чата; избранное/сохранённые
   поиски; технические (cookies, IP, устройство, near-me геолокация); фотографии
3. Цели обработки (сервис, модерация, уведомления email/SMS/push, антифрод, аналитика,
   исполнение закона)
4. Правовые основания (согласие, исполнение договора-оферты, законный интерес, требование
   закона)
5. Передача под-обработчикам: Eskiz (SMS), Yandex Maps (карты), Google/Yandex Translate
   (автоперевод), Cloudflare R2 (хранение фото), SMTP-провайдер (email), FCM (push),
   провайдеры входа Google/Apple/Telegram; госорганы — по закону
6. Трансграничная передача (серверы/CDN за пределами РУз; согласие на трансграничную
   передачу)
7. Cookies и аналогичные технологии
8. Сроки хранения
9. Безопасность данных
10. Права субъекта ПДн (доступ, исправление, удаление, отзыв согласия) и как их реализовать
11. Данные несовершеннолетних
12. Изменения политики
13. Контакты оператора / как направить запрос

### Плейсхолдер-токены (заменить перед публикацией)
`[НАЗВАНИЕ ЮРЛИЦА]`, `[ОРГ-ПРАВОВАЯ ФОРМА]`, `[ЮР. АДРЕС]`, `[ИНН/ОГРН]`,
`[ДАТА РЕГИСТРАЦИИ]`, `[EMAIL ОПЕРАТОРА ДАННЫХ]`. Реальные значения из кода
подставляются как есть: `support@avino.uz`, домен `avino.uz`, соцсети TG/IG/FB/YT.

## 6. Тестирование и проверка

- Vitest+RTL `LegalDocument.test.tsx`: рендерит H1/`title`, все секции, якоря
  оглавления соответствуют `id` секций.
- Smoke: страницы экспортируют корректный `metadata` (через generateMetadata).
- Прогон `pnpm --filter @avino/client lint` и `build`.
- Git/PR ведёт контроллер; суб-агенты пишут только код (правило shared-workdir).

## 7. Вне объёма (YAGNI)

- Версионирование документов в БД / журнал редакций.
- Чекбоксы согласия в формах регистрации/создания объявления.
- Отдельная страница cookie-настроек (cookie consent banner).
- Добавление `/legal/*` в `sitemap.xml` — опционально, можно мелочью на этапе плана.

## 8. Границы и риски

- Тексты — болванка под Узбекистан с плейсхолдерами; **не являются юридической
  консультацией**, требуют ревью юриста перед публикацией.
- Все правки строго в `apps/client` (включая Footer). Кросс-папочных изменений нет →
  один PR.
