# Legal Pages (Terms of Service & Privacy Policy) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two public legal pages to the Avino portal — «Правила сервиса» (`/legal/terms`) and «Политика конфиденциальности» (`/legal/privacy`) — in uz/ru/en, and point the footer links at them.

**Architecture:** Hybrid storage (Подход C). Short UI chrome lives in `messages/*.json` (namespace `legal`); the long legal prose lives in typed per-locale TS data modules under `content/legal/` and is loaded only on the `/legal/*` routes via a static `getLegalDoc(kind, locale)` map. A single server component `LegalDocument` renders any `LegalDoc` (H1, last-updated date, sticky table of contents with anchor links, sections with paragraphs/lists/subheadings). Server components only — anchor ToC works without JS.

**Tech Stack:** Next.js App Router (server components), TypeScript, next-intl (`useTranslations`/`getTranslations`), Tailwind tokens, Vitest + React Testing Library.

## Global Constraints

- **One app folder only:** all changes are inside `apps/client/`. Do NOT touch `apps/web/` or `apps/api/`. The Footer edit is in `apps/client`. → single PR.
- **Locales:** `['uz','ru','en']`, default `'ru'`, `localePrefix: 'always'` (`apps/client/src/i18n/routing.ts`). `type Locale` is imported from `@/i18n/routing`.
- **Section `id`s are identical across all three locales** of the same document and in the same order. Switching language must preserve `#anchor`.
- **Do NOT put legal prose in `messages/*.json`.** Only the small `legal` chrome namespace goes there (it ships on every page).
- **Placeholder tokens** stay literally identical across languages and must be obvious to find-and-replace: `[НАЗВАНИЕ ЮРЛИЦА]`, `[ОРГ-ПРАВОВАЯ ФОРМА]`, `[ЮР. АДРЕС]`, `[ИНН/ОГРН]`, `[ДАТА РЕГИСТРАЦИИ]`, `[EMAIL ОПЕРАТОРА ДАННЫХ]`. Real values from the codebase are inlined as-is: `support@avino.uz`, domain `avino.uz`, socials TG/IG/FB/YT.
- **next-intl, not raw fetch.** Follow existing page pattern: server `page.tsx` + `generateMetadata` + `alternatesFor(path)`.
- **Git is owned by the controller**, not sub-agents (shared-workdir hazard). Sub-agents write code only.
- **Date display:** format `updatedAt` with the page locale via `Intl.DateTimeFormat(locale, …)`. (Money/number formatting rules are irrelevant here — no prices on these pages.)
- **Branch:** `feat/legal-pages` (already created). `main` is protected — open a PR; the user merges.

---

## File Structure

```
apps/client/src/content/legal/types.ts                  model: LegalBlock / LegalSection / LegalDoc / LegalKind
apps/client/src/content/legal/terms.ru.ts               Terms content (ru) — canonical
apps/client/src/content/legal/terms.uz.ts               Terms content (uz)
apps/client/src/content/legal/terms.en.ts               Terms content (en)
apps/client/src/content/legal/privacy.ru.ts             Privacy content (ru) — canonical
apps/client/src/content/legal/privacy.uz.ts             Privacy content (uz)
apps/client/src/content/legal/privacy.en.ts             Privacy content (en)
apps/client/src/content/legal/index.ts                  getLegalDoc(kind, locale) static map + ru fallback
apps/client/src/features/legal/LegalDocument.tsx        shared server renderer
apps/client/src/features/legal/LegalDocument.test.tsx   Vitest+RTL
apps/client/src/content/legal/terms.test.ts             content invariant test (ids parity across locales)
apps/client/src/content/legal/privacy.test.ts           content invariant test (ids parity across locales)
apps/client/src/app/[locale]/legal/terms/page.tsx       route + generateMetadata
apps/client/src/app/[locale]/legal/privacy/page.tsx     route + generateMetadata
apps/client/src/components/layout/Footer.tsx            repoint href /help → /legal/terms | /legal/privacy
apps/client/messages/ru.json                            +namespace legal
apps/client/messages/uz.json                            +namespace legal
apps/client/messages/en.json                            +namespace legal
```

---

## Task 1: Content model + i18n chrome

**Files:**
- Create: `apps/client/src/content/legal/types.ts`
- Modify: `apps/client/messages/ru.json` (add top-level `"legal"` key)
- Modify: `apps/client/messages/uz.json` (add top-level `"legal"` key)
- Modify: `apps/client/messages/en.json` (add top-level `"legal"` key)

**Interfaces:**
- Produces: `LegalBlock`, `LegalSection`, `LegalDoc`, `LegalKind` types; i18n namespace `legal` with keys `meta.terms.title`, `meta.terms.description`, `meta.privacy.title`, `meta.privacy.description`, `updatedLabel`, `toc`, `breadcrumbHome`.

- [ ] **Step 1: Create the type model**

`apps/client/src/content/legal/types.ts`:
```ts
/**
 * Модель юридического документа (Правила/Политика).
 * Тело хранится отдельными per-locale модулями (см. content/legal/*.{ru,uz,en}.ts),
 * чтобы длинный текст не попадал в глобальный i18n-бандл.
 */
export type LegalBlock =
  | { type: 'p'; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'subheading'; text: string };

export interface LegalSection {
  /** Стабильный slug-якорь, ОДИНАКОВЫЙ для всех языков документа. */
  id: string;
  heading: string;
  blocks: LegalBlock[];
}

export interface LegalDoc {
  title: string;
  /** ISO-дата (YYYY-MM-DD), одна для всех языков документа. */
  updatedAt: string;
  intro?: string;
  sections: LegalSection[];
}

export type LegalKind = 'terms' | 'privacy';
```

- [ ] **Step 2: Add the `legal` chrome namespace to `ru.json`**

Add this top-level key (place it after an existing key, valid JSON):
```json
"legal": {
  "meta": {
    "terms": {
      "title": "Правила сервиса — Avino",
      "description": "Правила пользования сервисом Avino: размещение объявлений, модерация, продвижение, ответственность сторон."
    },
    "privacy": {
      "title": "Политика конфиденциальности — Avino",
      "description": "Как Avino собирает, использует и защищает персональные данные пользователей."
    }
  },
  "updatedLabel": "Последнее обновление",
  "toc": "Содержание",
  "breadcrumbHome": "Главная"
}
```

- [ ] **Step 3: Add the `legal` namespace to `uz.json`**

```json
"legal": {
  "meta": {
    "terms": {
      "title": "Xizmat qoidalari — Avino",
      "description": "Avino xizmatidan foydalanish qoidalari: e'lonlarni joylash, moderatsiya, reklama va tomonlarning javobgarligi."
    },
    "privacy": {
      "title": "Maxfiylik siyosati — Avino",
      "description": "Avino foydalanuvchilarning shaxsiy ma'lumotlarini qanday yig'adi, ishlatadi va himoya qiladi."
    }
  },
  "updatedLabel": "Oxirgi yangilanish",
  "toc": "Mundarija",
  "breadcrumbHome": "Bosh sahifa"
}
```

- [ ] **Step 4: Add the `legal` namespace to `en.json`**

```json
"legal": {
  "meta": {
    "terms": {
      "title": "Terms of Service — Avino",
      "description": "Avino terms of service: posting listings, moderation, promotion, and liability of the parties."
    },
    "privacy": {
      "title": "Privacy Policy — Avino",
      "description": "How Avino collects, uses and protects users' personal data."
    }
  },
  "updatedLabel": "Last updated",
  "toc": "Contents",
  "breadcrumbHome": "Home"
}
```

- [ ] **Step 5: Verify the JSON files are valid and types compile**

Run: `node -e "require('./apps/client/messages/ru.json').legal; require('./apps/client/messages/uz.json').legal; require('./apps/client/messages/en.json').legal; console.log('json ok')"`
Expected: `json ok`

Run: `cd apps/client && pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | head -20`
Expected: no errors referencing `content/legal/types.ts`.

- [ ] **Step 6: Commit**

```bash
git add apps/client/src/content/legal/types.ts apps/client/messages/ru.json apps/client/messages/uz.json apps/client/messages/en.json
git commit -m "feat(legal): content model + i18n chrome for legal pages"
```

---

## Task 2: `LegalDocument` renderer + test

**Files:**
- Create: `apps/client/src/features/legal/LegalDocument.tsx`
- Test: `apps/client/src/features/legal/LegalDocument.test.tsx`

**Interfaces:**
- Consumes: `LegalDoc` from `@/content/legal/types`; `Locale` from `@/i18n/routing`; `Link` from `@/i18n/navigation`; i18n namespace `legal`.
- Produces: `export function LegalDocument({ doc, locale }: { doc: LegalDoc; locale: Locale })`.

- [ ] **Step 1: Write the failing test**

`apps/client/src/features/legal/LegalDocument.test.tsx`:
```tsx
/**
 * LegalDocument.test.tsx — рендер юридического документа из модели LegalDoc.
 */
import { render, screen } from '@testing-library/react';
import { it, expect } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import { LegalDocument } from './LegalDocument';
import type { LegalDoc } from '@/content/legal/types';

const msgs = {
  legal: { updatedLabel: 'Последнее обновление', toc: 'Содержание', breadcrumbHome: 'Главная' },
};

const doc: LegalDoc = {
  title: 'Тестовый документ',
  updatedAt: '2026-06-29',
  sections: [
    { id: 'one', heading: 'Раздел один', blocks: [{ type: 'p', text: 'Первый абзац' }] },
    { id: 'two', heading: 'Раздел два', blocks: [{ type: 'list', items: ['Пункт A', 'Пункт B'] }] },
  ],
};

function setup() {
  render(
    <NextIntlClientProvider locale="ru" messages={msgs}>
      <LegalDocument doc={doc} locale="ru" />
    </NextIntlClientProvider>,
  );
}

it('рендерит H1 с заголовком документа', () => {
  setup();
  expect(screen.getByRole('heading', { level: 1, name: 'Тестовый документ' })).toBeInTheDocument();
});

it('рендерит метку «Последнее обновление»', () => {
  setup();
  expect(screen.getByText(/Последнее обновление/)).toBeInTheDocument();
});

it('рендерит обе секции как H2', () => {
  setup();
  expect(screen.getByRole('heading', { level: 2, name: 'Раздел один' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { level: 2, name: 'Раздел два' })).toBeInTheDocument();
});

it('оглавление содержит якорные ссылки на id секций', () => {
  setup();
  expect(screen.getByRole('link', { name: 'Раздел один' })).toHaveAttribute('href', '#one');
  expect(screen.getByRole('link', { name: 'Раздел два' })).toHaveAttribute('href', '#two');
});

it('рендерит пункты списка', () => {
  setup();
  expect(screen.getByText('Пункт A')).toBeInTheDocument();
  expect(screen.getByText('Пункт B')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @avino/client test -- LegalDocument`
Expected: FAIL — cannot resolve `./LegalDocument` (module not created yet).

- [ ] **Step 3: Implement `LegalDocument`**

`apps/client/src/features/legal/LegalDocument.tsx`:
```tsx
/**
 * LegalDocument — общий серверный рендер юридического документа (Правила/Политика).
 * H1 + дата + липкое оглавление (якорные ссылки, без JS) + секции (p/list/subheading).
 * Контент приходит готовой моделью LegalDoc; chrome-строки — namespace `legal`.
 */
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import type { LegalDoc } from '@/content/legal/types';
import type { Locale } from '@/i18n/routing';

function formatDate(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(iso));
}

export function LegalDocument({ doc, locale }: { doc: LegalDoc; locale: Locale }) {
  const t = useTranslations('legal');
  return (
    <div className="mx-auto max-w-[1100px] px-6 pb-20 pt-10">
      <nav className="mb-4 text-sm text-muted-foreground">
        <Link href="/" className="hover:text-ink">
          {t('breadcrumbHome')}
        </Link>
        <span className="mx-2">/</span>
        <span>{doc.title}</span>
      </nav>

      <h1 className="text-[clamp(28px,4vw,40px)]">{doc.title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {t('updatedLabel')}: {formatDate(doc.updatedAt, locale)}
      </p>
      {doc.intro && (
        <p className="mt-5 max-w-[760px] text-[15px] leading-relaxed text-muted-foreground">
          {doc.intro}
        </p>
      )}

      <div className="mt-8 gap-10 lg:grid lg:grid-cols-[260px_1fr]">
        <aside className="mb-8 lg:mb-0">
          <div className="rounded-card border border-border/60 bg-surface p-4 lg:sticky lg:top-24">
            <div className="text-sm font-bold">{t('toc')}</div>
            <ul className="mt-3 flex flex-col gap-2">
              {doc.sections.map((s) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} className="text-sm text-muted-foreground hover:text-teal">
                    {s.heading}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </aside>

        <div className="flex flex-col gap-9">
          {doc.sections.map((s) => (
            <section key={s.id} id={s.id} className="scroll-mt-24">
              <h2 className="text-[22px]">{s.heading}</h2>
              <div className="mt-3 flex flex-col gap-3 text-[15px] leading-relaxed text-muted-foreground">
                {s.blocks.map((b, i) => {
                  if (b.type === 'p') return <p key={i}>{b.text}</p>;
                  if (b.type === 'subheading')
                    return (
                      <h3 key={i} className="mt-2 text-[17px] font-bold text-ink">
                        {b.text}
                      </h3>
                    );
                  return (
                    <ul key={i} className="ml-5 flex list-disc flex-col gap-1.5">
                      {b.items.map((it, j) => (
                        <li key={j}>{it}</li>
                      ))}
                    </ul>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @avino/client test -- LegalDocument`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/features/legal/LegalDocument.tsx apps/client/src/features/legal/LegalDocument.test.tsx
git commit -m "feat(legal): LegalDocument renderer with anchored ToC"
```

---

## Task 3: Terms of Service content (ru/uz/en)

**Files:**
- Create: `apps/client/src/content/legal/terms.ru.ts`
- Create: `apps/client/src/content/legal/terms.uz.ts`
- Create: `apps/client/src/content/legal/terms.en.ts`
- Test: `apps/client/src/content/legal/terms.test.ts`

**Interfaces:**
- Consumes: `LegalDoc` from `./types`.
- Produces: `export const termsRu: LegalDoc`, `export const termsUz: LegalDoc`, `export const termsEn: LegalDoc`.

**Authoring rules (apply to every content task):**
- Author `*.ru.ts` first as canonical, then translate faithfully to uz and en, preserving section `id`s and order.
- Each section's `blocks` is real prose (`p`), bulleted `list`s, and optional `subheading`s. No placeholders-as-TODO; the only allowed placeholders are the legal tokens from Global Constraints.
- Tone: clear, neutral, OLX-style. These are a starting draft for legal review — not legal advice.

**Section map for Terms** (`id` — ru heading / uz heading / en heading → required clauses):

1. `general` — Общие положения / Umumiy qoidalar / General provisions
   - Что такое Avino (онлайн-площадка объявлений недвижимости по Узбекистану на домене `avino.uz`); оператор — «[ОРГ-ПРАВОВАЯ ФОРМА] [НАЗВАНИЕ ЮРЛИЦА]».
   - Термины: «Пользователь», «Объявление», «Сервис», «Модерация».
   - Правила = публичная оферта; регистрация/использование = акцепт; кто не согласен — не пользуется.
2. `account` — Аккаунт и роли / Hisob va rollar / Account and roles
   - Регистрация по номеру телефона (SMS-код через Eskiz) и/или через Google, Apple, Telegram.
   - Роли: USER, OWNER, AGENT, AGENCY, LANDLORD, PROPERTY_MANAGER; пользователь отвечает за достоверность данных и сохранность доступа.
   - Один человек — добросовестное использование; запрет передачи аккаунта третьим лицам и создания фейковых аккаунтов.
3. `listings` — Размещение объявлений и модерация / E'lonlarni joylash va moderatsiya / Posting and moderation
   - Объявление создаётся на одном языке и автоматически переводится на uz/ru/en.
   - Все объявления проходят модерацию: статус NEW → ACTIVE / DRAFT / REJECTED / DELETED; Avino вправе отклонить/снять без объяснения при нарушении правил.
   - Требования к объявлению: достоверность, реальные фото объекта, корректная цена и локация, без дублей.
4. `prohibited` — Запрещённый контент и поведение / Taqiqlangan kontent va xatti-harakatlar / Prohibited content and conduct
   - Список запретов: ложные/мошеннические объявления, чужие фото, контактные данные в фото, дубли, спам, оскорбления, незаконные предложения, обход модерации, скрейпинг.
   - Последствия: снятие объявления, блокировка аккаунта.
5. `promotion` — Платное продвижение / Pullik reklama / Paid promotion
   - Платные услуги выделения (VIP/TOP) могут предоставляться; на момент редакции — ограниченно/по флагу; активация может выполняться вручную до подключения онлайн-оплаты.
   - Продвижение влияет на видимость, но не на факт прохождения модерации; возвраты — по отдельным условиям «[…]».
6. `chat` — Чат и коммуникации / Chat va aloqa / Chat and communications
   - Внутренний чат для связи с автором объявления; правила: без спама, мошенничества, передачи предоплат вне договорённостей; Avino не сторона переписки.
7. `content-rights` — Права на контент / Kontentga huquqlar / Content rights
   - Пользователь гарантирует, что владеет правами на загружаемые фото/тексты; предоставляет Avino неисключительную лицензию на хранение, показ и автоперевод объявления в рамках Сервиса.
8. `liability` — Ответственность сторон / Tomonlarning javobgarligi / Liability
   - Avino — информационный посредник, не сторона сделок, не гарантирует достоверность объявлений и не несёт ответственности за действия пользователей; рекомендации по безопасной сделке (проверка документов, личная встреча, осторожность с предоплатой).
   - Сервис предоставляется «как есть».
9. `ip` — Интеллектуальная собственность Avino / Avino intellektual mulki / Avino intellectual property
   - Бренд, логотип, дизайн, база объявлений принадлежат оператору; запрет копирования/скрейпинга/использования без разрешения.
10. `termination` — Блокировка и удаление / Bloklash va o'chirish / Suspension and termination
    - Основания и порядок блокировки аккаунта/удаления объявлений; право пользователя удалить свой аккаунт.
11. `changes` — Изменение Правил / Qoidalarga o'zgartirishlar / Changes to the Terms
    - Avino вправе изменять Правила; дата в «Последнее обновление»; продолжение использования = согласие.
12. `law` — Применимое право и споры / Amaldagi qonun va nizolar / Governing law and disputes
    - Применимое право — Республика Узбекистан; досудебный (претензионный) порядок; подсудность по месту нахождения оператора.
13. `contacts` — Реквизиты и контакты / Rekvizitlar va aloqa / Details and contacts
    - «[ОРГ-ПРАВОВАЯ ФОРМА] [НАЗВАНИЕ ЮРЛИЦА]», «[ЮР. АДРЕС]», «[ИНН/ОГРН]»; поддержка: `support@avino.uz`; соцсети: Telegram `@avino_uz`, Instagram `avino.uz`, Facebook `avino.uz`, YouTube `@avino_uz`.

- [ ] **Step 1: Write the failing invariant test**

`apps/client/src/content/legal/terms.test.ts`:
```ts
/**
 * terms.test.ts — инвариант: все локали Правил имеют одинаковые id секций в одном порядке.
 */
import { it, expect } from 'vitest';
import { termsRu } from './terms.ru';
import { termsUz } from './terms.uz';
import { termsEn } from './terms.en';

const EXPECTED_IDS = [
  'general', 'account', 'listings', 'prohibited', 'promotion', 'chat',
  'content-rights', 'liability', 'ip', 'termination', 'changes', 'law', 'contacts',
];

it('ru содержит все ожидаемые секции по порядку', () => {
  expect(termsRu.sections.map((s) => s.id)).toEqual(EXPECTED_IDS);
});

it('uz и en имеют те же id секций, что и ru', () => {
  const ru = termsRu.sections.map((s) => s.id);
  expect(termsUz.sections.map((s) => s.id)).toEqual(ru);
  expect(termsEn.sections.map((s) => s.id)).toEqual(ru);
});

it('updatedAt совпадает во всех локалях', () => {
  expect(termsUz.updatedAt).toBe(termsRu.updatedAt);
  expect(termsEn.updatedAt).toBe(termsRu.updatedAt);
});

it('каждая секция непустая', () => {
  for (const doc of [termsRu, termsUz, termsEn]) {
    for (const s of doc.sections) expect(s.blocks.length).toBeGreaterThan(0);
  }
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @avino/client test -- legal/terms`
Expected: FAIL — cannot resolve `./terms.ru` etc.

- [ ] **Step 3: Author `terms.ru.ts` (canonical)**

Create `apps/client/src/content/legal/terms.ru.ts` exporting `termsRu: LegalDoc` with `title: 'Правила сервиса'`, `updatedAt: '2026-06-29'`, an `intro`, and the 13 sections from the section map above, each filled with real prose `p`/`list`/`subheading` blocks. Shape:
```ts
import type { LegalDoc } from './types';

export const termsRu: LegalDoc = {
  title: 'Правила сервиса',
  updatedAt: '2026-06-29',
  intro:
    'Настоящие Правила регулируют использование сервиса Avino — онлайн-площадки ' +
    'объявлений о недвижимости в Узбекистане. Пожалуйста, внимательно ознакомьтесь с ними.',
  sections: [
    {
      id: 'general',
      heading: 'Общие положения',
      blocks: [
        { type: 'p', text: 'Avino — онлайн-сервис размещения и поиска объявлений о недвижимости на сайте avino.uz. Оператором Сервиса является «[ОРГ-ПРАВОВАЯ ФОРМА] [НАЗВАНИЕ ЮРЛИЦА]» (далее — «Avino», «мы»).' },
        { type: 'p', text: 'Настоящие Правила являются публичной офертой. Регистрируясь или используя Сервис, вы принимаете эти Правила в полном объёме. Если вы не согласны — не используйте Сервис.' },
        { type: 'subheading', text: 'Термины' },
        { type: 'list', items: [
          'Пользователь — лицо, использующее Сервис.',
          'Объявление — размещённая Пользователем информация об объекте недвижимости.',
          'Модерация — проверка Объявления перед публикацией.',
        ] },
      ],
    },
    // ... остальные 12 секций по карте выше
  ],
};
```
Fill all 13 sections with substantive prose covering the listed clauses.

- [ ] **Step 4: Author `terms.uz.ts` and `terms.en.ts`**

Translate `termsRu` faithfully into `termsUz` (`title: 'Xizmat qoidalari'`) and `termsEn` (`title: 'Terms of Service'`). Keep the SAME `id`s, SAME order, SAME `updatedAt: '2026-06-29'`, and the SAME placeholder tokens. Same `import type { LegalDoc } from './types';` shape; export `termsUz` / `termsEn`.

- [ ] **Step 5: Run the invariant test to verify it passes**

Run: `pnpm --filter @avino/client test -- legal/terms`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/client/src/content/legal/terms.ru.ts apps/client/src/content/legal/terms.uz.ts apps/client/src/content/legal/terms.en.ts apps/client/src/content/legal/terms.test.ts
git commit -m "feat(legal): Terms of Service content (ru/uz/en)"
```

---

## Task 4: Privacy Policy content (ru/uz/en)

**Files:**
- Create: `apps/client/src/content/legal/privacy.ru.ts`
- Create: `apps/client/src/content/legal/privacy.uz.ts`
- Create: `apps/client/src/content/legal/privacy.en.ts`
- Test: `apps/client/src/content/legal/privacy.test.ts`

**Interfaces:**
- Consumes: `LegalDoc` from `./types`.
- Produces: `export const privacyRu: LegalDoc`, `export const privacyUz: LegalDoc`, `export const privacyEn: LegalDoc`.

Apply the same authoring rules as Task 3 (ru canonical first; uz/en faithful; identical `id`s/order/`updatedAt`/tokens).

**Section map for Privacy** (under РУз Law «О персональных данных» № ЗРУ-547):

1. `general` — Общие положения / Umumiy qoidalar / General provisions
   - Оператор — «[ОРГ-ПРАВОВАЯ ФОРМА] [НАЗВАНИЕ ЮРЛИЦА]»; политика описывает обработку ПДн пользователей Avino в соответствии с законодательством РУз («О персональных данных» № ЗРУ-547); использование Сервиса = согласие.
2. `data-collected` — Какие данные мы собираем / Qanday ma'lumotlar yig'amiz / Data we collect
   - subheading «Учётные данные»: номер телефона, email, имя.
   - subheading «Данные входа»: идентификаторы от Google, Apple, Telegram.
   - subheading «Контент»: объявления, их гео-координаты, фотографии, сообщения чата, избранное и сохранённые поиски.
   - subheading «Технические данные»: IP-адрес, тип устройства/браузера, cookies, при использовании поиска «рядом» — геолокация (с согласия).
3. `purposes` — Цели обработки / Ishlov berish maqsadlari / Purposes of processing
   - Предоставление и работа Сервиса; модерация; уведомления (email, SMS через Eskiz, push); антифрод и безопасность; аналитика и улучшение; исполнение требований закона.
4. `legal-basis` — Правовые основания / Huquqiy asoslar / Legal basis
   - Согласие субъекта; исполнение договора-оферты (Правил); законный интерес (безопасность, антифрод); требования законодательства.
5. `sharing` — Передача третьим лицам / Uchinchi shaxslarga uzatish / Sharing with third parties
   - list под-обработчиков с целями: Eskiz (отправка SMS), Yandex Maps (карты/геокодирование), Google/Yandex Translate (автоперевод объявлений), Cloudflare R2 (хранение фотографий), SMTP-провайдер (email-уведомления), Firebase Cloud Messaging (push), провайдеры входа Google/Apple/Telegram (аутентификация).
   - Передача госорганам — только на законных основаниях. Мы не продаём персональные данные.
6. `cross-border` — Трансграничная передача / Chegaradan tashqari uzatish / Cross-border transfer
   - Часть под-обработчиков/серверов/CDN расположена за пределами РУз; используя Сервис, пользователь даёт согласие на трансграничную передачу в объёме, необходимом для работы Сервиса.
7. `cookies` — Cookies и аналогичные технологии / Cookie va shunga o'xshash texnologiyalar / Cookies
   - Назначение cookies (сессия, настройки языка/валюты, аналитика); управление через настройки браузера.
8. `retention` — Сроки хранения / Saqlash muddatlari / Retention
   - Данные хранятся пока активен аккаунт/объявление и в течение срока, требуемого законом; после удаления аккаунта — удаление/обезличивание в разумный срок «[…]».
9. `security` — Безопасность данных / Ma'lumotlar xavfsizligi / Data security
   - Организационные и технические меры (шифрование канала, контроль доступа); оговорка об отсутствии абсолютной гарантии в интернете.
10. `rights` — Права субъекта персональных данных / Subyekt huquqlari / Your rights
    - Право на доступ, исправление, удаление, блокирование, отзыв согласия; как реализовать — запрос на `[EMAIL ОПЕРАТОРА ДАННЫХ]`; срок ответа «[…]».
11. `minors` — Данные несовершеннолетних / Voyaga yetmaganlar ma'lumotlari / Minors
    - Сервис не предназначен для лиц младше 18 лет; мы не собираем данные детей осознанно.
12. `changes` — Изменения политики / Siyosatga o'zgartirishlar / Changes to this policy
    - Право изменять Политику; дата в «Последнее обновление»; существенные изменения — уведомление в Сервисе.
13. `contacts` — Контакты оператора / Operator bilan aloqa / Contact the operator
    - Оператор: «[ОРГ-ПРАВОВАЯ ФОРМА] [НАЗВАНИЕ ЮРЛИЦА]», «[ЮР. АДРЕС]»; вопросы по ПДн: `[EMAIL ОПЕРАТОРА ДАННЫХ]`; общая поддержка: `support@avino.uz`.

- [ ] **Step 1: Write the failing invariant test**

`apps/client/src/content/legal/privacy.test.ts`:
```ts
/**
 * privacy.test.ts — инвариант: все локали Политики имеют одинаковые id секций в одном порядке.
 */
import { it, expect } from 'vitest';
import { privacyRu } from './privacy.ru';
import { privacyUz } from './privacy.uz';
import { privacyEn } from './privacy.en';

const EXPECTED_IDS = [
  'general', 'data-collected', 'purposes', 'legal-basis', 'sharing', 'cross-border',
  'cookies', 'retention', 'security', 'rights', 'minors', 'changes', 'contacts',
];

it('ru содержит все ожидаемые секции по порядку', () => {
  expect(privacyRu.sections.map((s) => s.id)).toEqual(EXPECTED_IDS);
});

it('uz и en имеют те же id секций, что и ru', () => {
  const ru = privacyRu.sections.map((s) => s.id);
  expect(privacyUz.sections.map((s) => s.id)).toEqual(ru);
  expect(privacyEn.sections.map((s) => s.id)).toEqual(ru);
});

it('updatedAt совпадает во всех локалях', () => {
  expect(privacyUz.updatedAt).toBe(privacyRu.updatedAt);
  expect(privacyEn.updatedAt).toBe(privacyRu.updatedAt);
});

it('каждая секция непустая', () => {
  for (const doc of [privacyRu, privacyUz, privacyEn]) {
    for (const s of doc.sections) expect(s.blocks.length).toBeGreaterThan(0);
  }
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @avino/client test -- legal/privacy`
Expected: FAIL — cannot resolve `./privacy.ru` etc.

- [ ] **Step 3: Author `privacy.ru.ts` (canonical)**

Create `apps/client/src/content/legal/privacy.ru.ts` exporting `privacyRu: LegalDoc` with `title: 'Политика конфиденциальности'`, `updatedAt: '2026-06-29'`, an `intro`, and the 13 sections from the section map, each filled with real prose. Same module shape as `terms.ru.ts` (`import type { LegalDoc } from './types';`).

- [ ] **Step 4: Author `privacy.uz.ts` and `privacy.en.ts`**

Translate faithfully: `privacyUz` (`title: 'Maxfiylik siyosati'`), `privacyEn` (`title: 'Privacy Policy'`). Same `id`s/order/`updatedAt`/tokens. Export `privacyUz` / `privacyEn`.

- [ ] **Step 5: Run the invariant test to verify it passes**

Run: `pnpm --filter @avino/client test -- legal/privacy`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/client/src/content/legal/privacy.ru.ts apps/client/src/content/legal/privacy.uz.ts apps/client/src/content/legal/privacy.en.ts apps/client/src/content/legal/privacy.test.ts
git commit -m "feat(legal): Privacy Policy content (ru/uz/en)"
```

---

## Task 5: Loader + routes + footer wiring

**Files:**
- Create: `apps/client/src/content/legal/index.ts`
- Create: `apps/client/src/app/[locale]/legal/terms/page.tsx`
- Create: `apps/client/src/app/[locale]/legal/privacy/page.tsx`
- Modify: `apps/client/src/components/layout/Footer.tsx:42-49`
- Test: `apps/client/src/content/legal/index.test.ts`

**Interfaces:**
- Consumes: all six content modules; `LegalDoc`, `LegalKind` from `./types`; `Locale` from `@/i18n/routing`; `LegalDocument` from `@/features/legal/LegalDocument`; `alternatesFor` from `@/lib/seo/alternates`.
- Produces: `export function getLegalDoc(kind: LegalKind, locale: Locale): LegalDoc`.

- [ ] **Step 1: Write the failing loader test**

`apps/client/src/content/legal/index.test.ts`:
```ts
/**
 * index.test.ts — getLegalDoc резолвит документ по виду и локали, фолбэк на ru.
 */
import { it, expect } from 'vitest';
import { getLegalDoc } from './index';

it('возвращает Правила на нужном языке', () => {
  expect(getLegalDoc('terms', 'ru').title).toBe('Правила сервиса');
  expect(getLegalDoc('terms', 'uz').title).toBe('Xizmat qoidalari');
  expect(getLegalDoc('terms', 'en').title).toBe('Terms of Service');
});

it('возвращает Политику на нужном языке', () => {
  expect(getLegalDoc('privacy', 'en').title).toBe('Privacy Policy');
});

it('фолбэк на ru для неизвестной локали', () => {
  // @ts-expect-error — проверяем рантайм-фолбэк
  expect(getLegalDoc('terms', 'fr').title).toBe('Правила сервиса');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @avino/client test -- legal/index`
Expected: FAIL — cannot resolve `./index`.

- [ ] **Step 3: Implement the loader**

`apps/client/src/content/legal/index.ts`:
```ts
/**
 * Реестр юридических документов: статическая карта kind × locale + фолбэк на ru.
 */
import type { LegalDoc, LegalKind } from './types';
import type { Locale } from '@/i18n/routing';
import { termsRu } from './terms.ru';
import { termsUz } from './terms.uz';
import { termsEn } from './terms.en';
import { privacyRu } from './privacy.ru';
import { privacyUz } from './privacy.uz';
import { privacyEn } from './privacy.en';

const DOCS: Record<LegalKind, Record<Locale, LegalDoc>> = {
  terms: { ru: termsRu, uz: termsUz, en: termsEn },
  privacy: { ru: privacyRu, uz: privacyUz, en: privacyEn },
};

export function getLegalDoc(kind: LegalKind, locale: Locale): LegalDoc {
  return DOCS[kind][locale] ?? DOCS[kind].ru;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @avino/client test -- legal/index`
Expected: PASS (3 tests).

- [ ] **Step 5: Create the Terms route**

`apps/client/src/app/[locale]/legal/terms/page.tsx`:
```tsx
/**
 * /legal/terms — Правила сервиса Avino.
 */
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { LegalDocument } from '@/features/legal/LegalDocument';
import { getLegalDoc } from '@/content/legal';
import { alternatesFor } from '@/lib/seo/alternates';
import type { Locale } from '@/i18n/routing';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'legal' });
  return {
    title: t('meta.terms.title'),
    description: t('meta.terms.description'),
    alternates: alternatesFor('/legal/terms'),
  };
}

export default async function TermsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return <LegalDocument doc={getLegalDoc('terms', locale as Locale)} locale={locale as Locale} />;
}
```

- [ ] **Step 6: Create the Privacy route**

`apps/client/src/app/[locale]/legal/privacy/page.tsx`:
```tsx
/**
 * /legal/privacy — Политика конфиденциальности Avino.
 */
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { LegalDocument } from '@/features/legal/LegalDocument';
import { getLegalDoc } from '@/content/legal';
import { alternatesFor } from '@/lib/seo/alternates';
import type { Locale } from '@/i18n/routing';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'legal' });
  return {
    title: t('meta.privacy.title'),
    description: t('meta.privacy.description'),
    alternates: alternatesFor('/legal/privacy'),
  };
}

export default async function PrivacyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return <LegalDocument doc={getLegalDoc('privacy', locale as Locale)} locale={locale as Locale} />;
}
```

- [ ] **Step 7: Repoint the footer links**

In `apps/client/src/components/layout/Footer.tsx`, the `help` column currently has:
```ts
{ labelKey: 'terms', href: '/help' },
{ labelKey: 'privacy', href: '/help' },
```
Change to:
```ts
{ labelKey: 'terms', href: '/legal/terms' },
{ labelKey: 'privacy', href: '/legal/privacy' },
```
(Leave the other three links — `support`, `safeDeal` — pointing at `/help`.)

- [ ] **Step 8: Lint, type-check, and build**

Run: `pnpm --filter @avino/client lint`
Expected: no new errors. (Verify no unused imports — eslint here does NOT flag unused imports automatically; eyeball the new files.)

Run: `cd apps/client && pnpm exec next build 2>&1 | tail -25`
Expected: build succeeds; `/[locale]/legal/terms` and `/[locale]/legal/privacy` appear in the route list. (Note: `rtk next build` can falsely report "Errors: 1" on a clean build — trust raw `pnpm exec next build`.)

- [ ] **Step 9: Run the full client test suite**

Run: `pnpm --filter @avino/client test`
Expected: all legal tests pass; the only failures are the 2 pre-existing `LoginModal.test.tsx` failures (known debt, not a regression).

- [ ] **Step 10: Commit**

```bash
git add apps/client/src/content/legal/index.ts apps/client/src/content/legal/index.test.ts apps/client/src/app/[locale]/legal/terms/page.tsx apps/client/src/app/[locale]/legal/privacy/page.tsx apps/client/src/components/layout/Footer.tsx
git commit -m "feat(legal): /legal/terms & /legal/privacy routes + footer links"
```

---

## Task 6: Tracking docs (DONE.md / ADR)

**Files:**
- Modify: `docs/DONE.md` (prepend entry) — create if absent
- Create: `docs/adr/ADR-XXXX-legal-pages.md` (next free number)

Per project CLAUDE.md, finalize tracking in the feature PR (no separate follow-up PR).

- [ ] **Step 1: Determine the next ADR number**

Run: `ls docs/adr/ | tail -5`
Pick the next free `ADR-XXXX`.

- [ ] **Step 2: Write the ADR**

`docs/adr/ADR-XXXX-legal-pages.md` — Status: Accepted; Date: 2026-06-29. Context: portal needs public Terms & Privacy like OLX. Decision: hybrid storage (i18n chrome + per-locale TS content modules), routes `/legal/terms` & `/legal/privacy`, single `LegalDocument` renderer, placeholder legal tokens pending legal review. Consequences: legal prose stays out of the global i18n bundle; content invariants enforced by tests; trade-off — placeholders must be replaced and the text reviewed by a lawyer before production. Related files: the `content/legal/*`, `features/legal/*`, and route files.

- [ ] **Step 3: Add the DONE.md entry**

Prepend a dated `### TASK — Legal pages (Terms & Privacy)` entry per the DONE format in CLAUDE.md (Status: DONE only after merge; until then note `PR: pending`).

- [ ] **Step 4: Commit**

```bash
git add docs/DONE.md docs/adr/ADR-XXXX-legal-pages.md
git commit -m "docs(legal): ADR + DONE entry for legal pages"
```

---

## Self-Review

**Spec coverage:** rendered pages ✓ (T5); uz/ru/en ✓ (T3/T4); footer rewiring ✓ (T5 Step 7); placeholders ✓ (Global Constraints + content tasks); hybrid storage ✓ (T1 model, T3/T4 content, T5 loader); ToC/anchors ✓ (T2); metadata + alternates ✓ (T5); tests ✓ (T2/T3/T4/T5); ADR + DONE ✓ (T6). Terms 13 sections and Privacy 13 sections both mapped. No spec requirement left unassigned.

**Placeholder scan:** the only placeholders are the intentional legal tokens (`[НАЗВАНИЕ ЮРЛИЦА]` etc.) explicitly allowed by Global Constraints. The content-authoring steps describe required clauses per section concretely (not "write appropriate text") — the prose itself is the deliverable, which is the correct altitude for legal copy.

**Type consistency:** `LegalDoc`/`LegalSection`/`LegalBlock`/`LegalKind` defined in T1 are used identically in T2 (component props), T3/T4 (content exports `termsRu`/`termsUz`/`termsEn`, `privacyRu`/`privacyUz`/`privacyEn`), and T5 (`getLegalDoc(kind, locale)` map). Block discriminator values `'p'`/`'list'`/`'subheading'` match between the type, the renderer's switch, and the content shape examples. Route props use `Promise<{ locale: string }>` consistent with the existing help page.
