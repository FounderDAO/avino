# Zillow-фильтр цены (гистограмма + слайдер) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Переделать фильтр цены публичного портала в стиле Zillow — вкладки «Цена / Ежемесячный платёж», гистограмма распределения цен за слайдером с двумя ручками, поля Мин/Макс, кнопка «Применить»; всё в текущей выбранной валюте.

**Architecture:** Новый backend-эндпоинт `GET /api/v1/search/price-distribution` отдаёт бакеты распределения цен по (валюта + тип сделки). На клиенте старый dropdown «Цена» (`FilterBar.tsx:418-448`) заменяется компонентом `PriceFilter` (Radix `Popover`): чистый презентационный `PriceRangeControl` (гистограмма + Radix range-`Slider` + поля) внутри тонкого контейнера, тянущего распределение через RTK Query. Попутно чинится латентный SSR-баг: `currency` не доезжал до бэкенда при ценовом фильтре (смешивались UZS/USD).

**Tech Stack:** NestJS + Prisma + Postgres (`width_bucket`, `percentile_cont`) на бэке; Next.js 15 + React 19 + RTK Query + `radix-ui` (Popover, Slider — уже в зависимостях, новых пакетов НЕТ) + Tailwind на клиенте. Тесты: Jest (api), Vitest + RTL (client).

## Global Constraints

- **Две app-папки = два PR** (правило проекта). PR A — `apps/api` (ветка `feat/price-distribution-api`). PR B — `apps/client` (ветка `feat/zillow-price-filter-client`). Каждый PR самодостаточен; клиент деградирует без данных гистограммы.
- **Git владеет контроллер.** Субагенты НЕ трогают git (`git add`/`commit`/checkout). Шаги «Commit» выполняет контроллер между ревью задач.
- **Новых npm-зависимостей НЕ добавляем.** Слайдер и Popover — из уже установленного `radix-ui ^1.5.0` (`import { Slider, Popover } from 'radix-ui'`).
- **Без FX в фильтрации.** Цена сравнивается в пределах одной валюты (`currency::text = X AND price >= … AND price <= …`). Тоггл сум/$ — это `displayCurrency` (`useCurrencyPreference`).
- **Response-DTO обязан лежать в `*.dto.ts`** — иначе swagger-плагин его не задокументирует и drift-check сломается.
- **`/api/v1/search` уже в `PUBLIC_PATH_PREFIXES`** (`swagger.documents.ts`) → новый суб-роут попадает в публичный документ автоматически; allowlist править НЕ нужно, только regen + drift-check.
- **API camelCase отсутствует как глобальный трансформер;** домен поиска отдаёт **snake_case** (как `next_cursor`, `fetched_at`). Response price-distribution — тоже snake_case; клиент маппит в camelCase (как `exchangeRateApi`).
- **Карта-страница вне объёма** для currency-фикса: `app/[locale]/map/page.tsx` строит минимальный `filter = tx ? { tx } : {}` и цену на SSR не применяет (предсуществующее поведение). Currency-парсинг добавляем только в `search/page.tsx`.
- **i18n: три языка (ru/uz/en) обязательно.** Mock next-intl в тестах скрывает отсутствующие ключи (известная гоча) — ключи проверять глазами в JSON.
- **Команды:** api — `pnpm --filter @avino/api test` (jest), `pnpm --filter @avino/api test:int` (jest --config jest.int.config.js), `pnpm --filter @avino/api openapi:export`, `pnpm --filter @avino/api lint`. client — `pnpm --filter @avino/client test` (vitest run), `pnpm --filter @avino/client lint`, `pnpm --filter @avino/client build`.

---

# Часть A — Backend (`apps/api`, ветка `feat/price-distribution-api`)

### Task A1: DTO распределения цен

**Files:**
- Create: `apps/api/src/search/dto/price-distribution.dto.ts`

**Interfaces:**
- Produces: `PriceDistributionQueryDto { currency: Currency; transaction_type: TransactionType }` (оба обязательны), `PriceBucketDto { from: number; to: number; count: number }`, `PriceDistributionResponseDto { currency: Currency; transaction_type: TransactionType; min: number; max: number; buckets: PriceBucketDto[]; overflow_count: number }`.

- [ ] **Step 1: Создать файл DTO**

```ts
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { Currency, TransactionType } from '@prisma/client';

/**
 * Query для `GET /api/v1/search/price-distribution` (гистограмма цены).
 * Оба параметра обязательны: распределение считается в пределах одной валюты
 * и одного типа сделки (цена сравнивается без FX, API.md §9).
 */
export class PriceDistributionQueryDto {
  /** Валюта распределения (бакеты строятся по объявлениям в этой валюте). */
  @IsEnum(Currency)
  currency!: Currency;

  /** Тип сделки (продажа/аренда — у них принципиально разный масштаб цен). */
  @IsEnum(TransactionType)
  transaction_type!: TransactionType;
}

/** Один столбик гистограммы: полуинтервал [from, to) и число объявлений. */
export class PriceBucketDto {
  @ApiProperty({ description: 'Нижняя граница бакета (включительно)' })
  from!: number;

  @ApiProperty({ description: 'Верхняя граница бакета (исключительно)' })
  to!: number;

  @ApiProperty({ description: 'Число объявлений в бакете' })
  count!: number;
}

/**
 * Распределение цен для слайдера: домен [min, max], бакеты равной ширины и
 * «хвост» overflow_count (объявления дороже max — аналог Zillow «$10M+»).
 */
export class PriceDistributionResponseDto {
  @ApiProperty({ enum: Currency })
  currency!: Currency;

  @ApiProperty({ enum: TransactionType })
  transaction_type!: TransactionType;

  @ApiProperty({ description: 'Нижняя граница домена (всегда 0)' })
  min!: number;

  @ApiProperty({ description: 'Верхняя граница домена (округлённый p99-потолок)' })
  max!: number;

  @ApiProperty({ type: [PriceBucketDto] })
  buckets!: PriceBucketDto[];

  @ApiProperty({ description: 'Число объявлений строго дороже max' })
  overflow_count!: number;
}
```

- [ ] **Step 2: Проверить компиляцию**

Run: `pnpm --filter @avino/api lint`
Expected: PASS (нет ошибок в новом файле).

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/search/dto/price-distribution.dto.ts
git commit -m "feat(api): add price-distribution DTOs"
```

---

### Task A2: Метод сервиса `priceDistribution`

**Files:**
- Modify: `apps/api/src/search/search.service.ts` (добавить метод в класс `SearchService` + модульный хелпер `niceCeil`)
- Test: `apps/api/src/search/search.service.distribution.int-spec.ts`

**Interfaces:**
- Consumes: `PriceDistributionQueryDto`, `PriceDistributionResponseDto`, `PriceBucketDto` (Task A1); `this.prisma.$queryRaw` + `Prisma.sql` (существуют).
- Produces: `SearchService.priceDistribution(query: PriceDistributionQueryDto): Promise<PriceDistributionResponseDto>`.

- [ ] **Step 1: Написать падающий int-тест**

Создать `apps/api/src/search/search.service.distribution.int-spec.ts` (зеркало существующего `search.service.int-spec.ts`: живой Postgres, изоляция по уникальному `cityId`, очистка в `afterAll`):

```ts
import {
  Currency,
  Language,
  ListingStatus,
  PropertyType,
  PromotionType,
  TransactionType,
  TranslationSource,
} from '@prisma/client';
import { DistrictsService } from '../geo';
import { PrismaService } from '../prisma';
import { TranslationsService } from '../translations';
import { UploadsService } from '../uploads';
import { SearchService } from './search.service';

const uploadsStub = {
  resolveMediaUrl: async (_k: string | null | undefined, url: string) => url,
} as unknown as UploadsService;

describe('SearchService.priceDistribution (integration, live PostgreSQL)', () => {
  const prisma = new PrismaService();
  const service = new SearchService(
    prisma,
    new TranslationsService(prisma),
    new DistrictsService(prisma),
    uploadsStub,
  );

  const CITY_ID = '11111111-2222-4333-8444-666666666666';
  let ownerId: string;

  async function createListing(price: string, currency: Currency, tx: TransactionType): Promise<void> {
    await prisma.listing.create({
      data: {
        ownerId,
        transactionType: tx,
        propertyType: PropertyType.APARTMENT,
        status: ListingStatus.ACTIVE,
        originalLanguage: Language.RU,
        price,
        currency,
        cityId: CITY_ID,
        promotionType: PromotionType.NONE,
        translations: {
          create: [{ language: Language.RU, title: 'd', source: TranslationSource.USER }],
        },
      },
    });
  }

  beforeAll(async () => {
    const owner = await prisma.user.create({ data: { phone: '+99890' + Date.now().toString().slice(-7) } });
    ownerId = owner.id;
    // 10 USD-объявлений на продажу: 10k..100k
    for (let i = 1; i <= 10; i++) await createListing(`${i * 10000}.00`, Currency.USD, TransactionType.SALE);
    // шум, который не должен попасть в выборку: другая валюта и другая сделка
    await createListing('500000.00', Currency.UZS, TransactionType.SALE);
    await createListing('999999.00', Currency.USD, TransactionType.RENT);
  });

  afterAll(async () => {
    await prisma.listing.deleteMany({ where: { cityId: CITY_ID } });
    await prisma.user.delete({ where: { id: ownerId } });
    await prisma.$disconnect();
  });

  it('считает распределение только по (currency, transaction_type) и видимым ACTIVE', async () => {
    const res = await service.priceDistribution({
      currency: Currency.USD,
      transaction_type: TransactionType.SALE,
    });
    expect(res.currency).toBe('USD');
    expect(res.transaction_type).toBe('SALE');
    expect(res.min).toBe(0);
    expect(res.max).toBeGreaterThan(0);
    expect(res.buckets.length).toBe(30);
    const total = res.buckets.reduce((s, b) => s + b.count, 0) + res.overflow_count;
    expect(total).toBe(10); // 10 USD/SALE; UZS- и RENT-шум исключены
  });

  it('пустая выборка → max=0, пустые бакеты', async () => {
    const res = await service.priceDistribution({
      currency: Currency.UZS,
      transaction_type: TransactionType.RENT,
    });
    expect(res.max).toBe(0);
    expect(res.buckets).toEqual([]);
    expect(res.overflow_count).toBe(0);
  });
});
```

- [ ] **Step 2: Запустить тест — убедиться, что падает**

Run: `pnpm --filter @avino/api test:int -- search.service.distribution`
Expected: FAIL — `service.priceDistribution is not a function`.

- [ ] **Step 3: Добавить модульный хелпер `niceCeil` в начало файла (после импортов, рядом с другими модульными константами)**

`apps/api/src/search/search.service.ts`:

```ts
/**
 * Округляет «вверх» до красивого числа (1/2/2.5/5/10 × 10^k) — потолок домена
 * слайдера, чтобы подписи осей были аккуратными (487300 → 500000).
 */
function niceCeil(v: number): number {
  if (v <= 0) return 0;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  const norm = v / mag;
  const nice = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
  return nice * mag;
}
```

- [ ] **Step 4: Добавить метод `priceDistribution` в класс `SearchService`**

Вставить как публичный метод класса (рядом с `searchPolygon`). Импорт `PriceDistributionQueryDto`/`PriceDistributionResponseDto`/`PriceBucketDto` из `./dto/price-distribution.dto` добавить к существующим импортам сверху файла.

```ts
  /**
   * `GET /api/v1/search/price-distribution` — гистограмма цены для слайдера.
   * Глобально по (currency, transaction_type), только видимые ACTIVE-объявления.
   * Домен [0, max], где max = niceCeil(p99); всё дороже — overflow. Без FX.
   */
  async priceDistribution(
    query: PriceDistributionQueryDto,
  ): Promise<PriceDistributionResponseDto> {
    const N = 30;
    const where = Prisma.sql`status = 'ACTIVE' AND transaction_type::text = ${query.transaction_type} AND currency::text = ${query.currency}`;

    const statsRows = await this.prisma.$queryRaw<
      { ceiling: number | null; total: number }[]
    >(Prisma.sql`
      SELECT percentile_cont(0.99) WITHIN GROUP (ORDER BY price)::float8 AS ceiling,
             count(*)::int AS total
      FROM listings
      WHERE ${where}
    `);
    const total = statsRows[0]?.total ?? 0;
    const max = niceCeil(statsRows[0]?.ceiling ?? 0);

    if (total === 0 || max <= 0) {
      return {
        currency: query.currency,
        transaction_type: query.transaction_type,
        min: 0,
        max: 0,
        buckets: [],
        overflow_count: 0,
      };
    }

    const bucketRows = await this.prisma.$queryRaw<{ b: number; c: number }[]>(
      Prisma.sql`
        SELECT width_bucket(price::float8, 0, ${max}, ${N}) AS b, count(*)::int AS c
        FROM listings
        WHERE ${where}
        GROUP BY b
        ORDER BY b
      `,
    );

    const counts = new Map<number, number>();
    for (const r of bucketRows) counts.set(Number(r.b), Number(r.c));

    const step = max / N;
    const buckets: PriceBucketDto[] = [];
    for (let i = 1; i <= N; i++) {
      buckets.push({ from: (i - 1) * step, to: i * step, count: counts.get(i) ?? 0 });
    }
    // width_bucket → N+1 для price >= max (и 0 для price < 0, чего не бывает).
    const overflow_count = counts.get(N + 1) ?? 0;

    return {
      currency: query.currency,
      transaction_type: query.transaction_type,
      min: 0,
      max,
      buckets,
      overflow_count,
    };
  }
```

- [ ] **Step 5: Запустить тест — убедиться, что проходит**

Run: `pnpm --filter @avino/api test:int -- search.service.distribution`
Expected: PASS (оба теста).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/search/search.service.ts apps/api/src/search/search.service.distribution.int-spec.ts
git commit -m "feat(api): price distribution aggregation in SearchService"
```

---

### Task A3: Роут контроллера

**Files:**
- Modify: `apps/api/src/search/search.controller.ts`

**Interfaces:**
- Consumes: `SearchService.priceDistribution` (A2), `PriceDistributionQueryDto`/`PriceDistributionResponseDto` (A1).
- Produces: `GET /api/v1/search/price-distribution`.

- [ ] **Step 1: Добавить импорты**

В шапку `search.controller.ts`:

```ts
import { ApiOkResponse } from '@nestjs/swagger';
import {
  PriceDistributionQueryDto,
  PriceDistributionResponseDto,
} from './dto/price-distribution.dto';
```

- [ ] **Step 2: Добавить метод-роут в класс `SearchController`**

После `searchPolygon`:

```ts
  /**
   * `GET /api/v1/search/price-distribution` — гистограмма распределения цены
   * для слайдера фильтра (Zillow-вид). Глобально по (currency, transaction_type),
   * только видимые ACTIVE-объявления. Auth: public.
   */
  @Get('price-distribution')
  @ApiOkResponse({ type: PriceDistributionResponseDto })
  priceDistribution(
    @Query() query: PriceDistributionQueryDto,
  ): Promise<PriceDistributionResponseDto> {
    return this.searchService.priceDistribution(query);
  }
```

> **Порядок роутов:** `price-distribution` — статический сегмент, конфликта с `@Get()`/гео-роутами нет; место в классе значения не имеет.

- [ ] **Step 3: Проверить, что приложение поднимается и роут отвечает**

Run: `pnpm --filter @avino/api build`
Expected: PASS (компиляция без ошибок).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/search/search.controller.ts
git commit -m "feat(api): expose GET /search/price-distribution"
```

---

### Task A4: Валидация query (400 на мусор) — DTO-spec

**Files:**
- Test: `apps/api/src/search/dto/price-distribution.dto.spec.ts`

**Interfaces:**
- Consumes: `PriceDistributionQueryDto` (A1).

- [ ] **Step 1: Написать тест валидации (зеркало `search-listings.dto.spec.ts`)**

```ts
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { PriceDistributionQueryDto } from './price-distribution.dto';

function errorsFor(obj: Record<string, unknown>) {
  return validateSync(plainToInstance(PriceDistributionQueryDto, obj), {
    whitelist: true,
  });
}

it('валиден при currency+transaction_type из enum', () => {
  expect(errorsFor({ currency: 'USD', transaction_type: 'SALE' })).toHaveLength(0);
});

it('400: отсутствует currency', () => {
  expect(errorsFor({ transaction_type: 'SALE' }).length).toBeGreaterThan(0);
});

it('400: невалидный transaction_type', () => {
  expect(errorsFor({ currency: 'USD', transaction_type: 'LEASE' }).length).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Запустить тест**

Run: `pnpm --filter @avino/api test -- price-distribution.dto`
Expected: PASS (все 3).

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/search/dto/price-distribution.dto.spec.ts
git commit -m "test(api): price-distribution DTO validation"
```

---

### Task A5: OpenAPI regen + ADR + DONE

**Files:**
- Modify: `apps/api/openapi.public.json` (регенерируется)
- Create: `docs/adr/ADR-0112-price-distribution-endpoint.md` (номер — следующий свободный; проверить `docs/adr/`)
- Modify: `docs/DONE.md` (если ведётся — добавить строку)

**Interfaces:** —

- [ ] **Step 1: Регенерировать публичный OpenAPI**

Скрипт `openapi:export` = `nest build && node dist/scripts/export-openapi.js`; ему нужны dummy-env (как в CI). Открыть `apps/api/scripts/export-openapi.ts` (или `src/config`) и подставить непустые значения требуемых переменных, затем:

Run: `pnpm --filter @avino/api openapi:export`
Expected: `openapi.public.json` обновлён, в `paths` появился `/api/v1/search/price-distribution`.

- [ ] **Step 2: Проверить дрейф (тот же чек, что в CI)**

Run: `pnpm --filter @avino/api test -- swagger`
Expected: PASS (`swagger.documents.spec.ts` / drift-check зелёный; путь в публичном allowlist по префиксу `/api/v1/search`).

- [ ] **Step 3: Написать ADR-0112**

`docs/adr/ADR-0112-price-distribution-endpoint.md`: контекст (Zillow-вид цены требует гистограммы), решение (`GET /search/price-distribution`, глобально по валюте+сделке, p99-потолок + overflow, без FX, публичный, не контекстный в v1), последствия (контекстная гистограмма — будущая фаза; кэш — опционально).

- [ ] **Step 4: Commit**

```bash
git add apps/api/openapi.public.json docs/adr/ADR-0112-price-distribution-endpoint.md docs/DONE.md
git commit -m "docs(api): ADR-0112 + regen openapi.public for price-distribution"
```

---

# Часть B — Frontend (`apps/client`, ветка `feat/zillow-price-filter-client`)

### Task B1: i18n-ключи (ru/uz/en)

**Files:**
- Modify: `apps/client/messages/ru.json`, `apps/client/messages/uz.json`, `apps/client/messages/en.json`

**Interfaces:**
- Produces: ключи `search.filters.priceTabMonthly`, `priceTabMonthlySoon`, `priceMinLabel`, `priceMaxLabel`. (Лейбл вкладки «Цена» переиспользует существующий `search.filters.price`; плейсхолдеры — `priceFrom`/`priceTo` + `currencySymbol*`; кнопки — `apply`/`resetAll`.)

- [ ] **Step 1: Добавить 4 ключа в `ru.json` (узел `search.filters`, рядом с `priceTo`)**

```json
      "priceTabMonthly": "Ежемесячный платёж",
      "priceTabMonthlySoon": "Скоро",
      "priceMinLabel": "Мин",
      "priceMaxLabel": "Макс",
```

- [ ] **Step 2: Добавить те же ключи в `uz.json`**

```json
      "priceTabMonthly": "Oylik to'lov",
      "priceTabMonthlySoon": "Tez orada",
      "priceMinLabel": "Min",
      "priceMaxLabel": "Maks",
```

- [ ] **Step 3: Добавить те же ключи в `en.json`**

```json
      "priceTabMonthly": "Monthly payment",
      "priceTabMonthlySoon": "Coming soon",
      "priceMinLabel": "Min",
      "priceMaxLabel": "Max",
```

- [ ] **Step 4: Проверить валидность JSON всех трёх файлов**

Run: `node -e "['ru','uz','en'].forEach(l=>JSON.parse(require('fs').readFileSync('apps/client/messages/'+l+'.json','utf8')))"`
Expected: без ошибок (молча завершается).

- [ ] **Step 5: Commit**

```bash
git add apps/client/messages/ru.json apps/client/messages/uz.json apps/client/messages/en.json
git commit -m "i18n(client): price filter tab/labels keys (ru/uz/en)"
```

---

### Task B2: UI-обёртка `Popover`

**Files:**
- Create: `apps/client/src/components/ui/popover.tsx`

**Interfaces:**
- Produces: `Popover`, `PopoverTrigger`, `PopoverContent` (стили — теми же токенами, что `DropdownContent`, но БЕЗ класса `fade-up`, чтобы не словить гочу containing-block).

- [ ] **Step 1: Создать обёртку (зеркало `dropdown.tsx`, на `radix-ui` Popover)**

```tsx
/**
 * Popover — лёгкая обёртка над radix-ui Popover со стилями Avino.
 * В отличие от Dropdown (меню), Popover держит произвольный интерактивный
 * контент (слайдер, инпуты, табы) без menu-семантики (arrow-key/typeahead).
 * Без класса `fade-up` (он ломает containing block для fixed-потомков).
 */
'use client';

import * as React from 'react';
import { Popover as RadixPopover } from 'radix-ui';
import { cn } from '@/lib/utils';

export const Popover = RadixPopover.Root;
export const PopoverTrigger = RadixPopover.Trigger;

export const PopoverContent = React.forwardRef<
  React.ComponentRef<typeof RadixPopover.Content>,
  React.ComponentPropsWithoutRef<typeof RadixPopover.Content>
>(({ className, sideOffset = 8, align = 'start', ...props }, ref) => (
  <RadixPopover.Portal>
    <RadixPopover.Content
      ref={ref}
      sideOffset={sideOffset}
      align={align}
      className={cn(
        'z-50 rounded-xl bg-surface p-4 shadow-raised',
        className,
      )}
      {...props}
    />
  </RadixPopover.Portal>
));
PopoverContent.displayName = 'PopoverContent';
```

- [ ] **Step 2: Проверить компиляцию**

Run: `pnpm --filter @avino/client lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/client/src/components/ui/popover.tsx
git commit -m "feat(client): add Popover ui wrapper (radix)"
```

---

### Task B3: Компактный форматтер цены `compactPrice`

**Files:**
- Modify: `apps/client/src/lib/format.ts`
- Test: `apps/client/src/lib/format.compactPrice.test.ts`

**Interfaces:**
- Consumes: существующие в `format.ts` — `trim(v: number): string`, тип `T = (key: string, values?) => string`, тип `Currency`.
- Produces: `compactPrice(value: number, currency: Currency, t: T): string`.

- [ ] **Step 1: Написать падающий тест**

```ts
import { compactPrice } from './format';

// units-переводчик: ключ → сам ключ
const t = (k: string) => k;

it('USD: тысячи и миллионы', () => {
  expect(compactPrice(0, 'USD', t)).toBe('$0');
  expect(compactPrice(98000, 'USD', t)).toBe('$98K');
  expect(compactPrice(1500000, 'USD', t)).toBe('$1,5M');
});

it('UZS: тысячи/миллионы/миллиарды с unit-ключами', () => {
  expect(compactPrice(500, 'UZS', t)).toBe('500 sum');
  expect(compactPrice(98000, 'UZS', t)).toBe('98K');
  expect(compactPrice(1500000000, 'UZS', t)).toBe('1,5 billion');
});
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `pnpm --filter @avino/client test -- format.compactPrice`
Expected: FAIL — `compactPrice` не экспортирован.

- [ ] **Step 3: Добавить функцию в `format.ts` (рядом с `pinPrice`, переиспользуя `trim`)**

```ts
/**
 * Компактная цена для осей гистограммы/слайдера: «$98K», «$1,5M», «1,5 billion».
 * Без конвертации валют — value уже в нужной валюте.
 */
export function compactPrice(value: number, currency: Currency, t: T): string {
  if (currency === 'USD') {
    if (value >= 1e6) return '$' + trim(value / 1e6) + 'M';
    if (value >= 1e3) return '$' + trim(value / 1e3) + 'K';
    return '$' + Math.round(value);
  }
  if (value >= 1e9) return trim(value / 1e9) + ' ' + t('billion');
  if (value >= 1e6) return trim(value / 1e6) + ' ' + t('million');
  if (value >= 1e3) return trim(value / 1e3) + 'K';
  return Math.round(value) + ' ' + t('sum');
}
```

- [ ] **Step 4: Запустить тест — проходит**

Run: `pnpm --filter @avino/client test -- format.compactPrice`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/lib/format.ts apps/client/src/lib/format.compactPrice.test.ts
git commit -m "feat(client): compactPrice formatter for histogram axis"
```

---

### Task B4: Чистые хелперы диапазона

**Files:**
- Create: `apps/client/src/features/search/controls/priceRange.ts`
- Test: `apps/client/src/features/search/controls/priceRange.test.ts`

**Interfaces:**
- Produces: типы `PriceDomain { min: number; max: number }`, `PriceDraft { min: number; max: number }`; `clamp(v, lo, hi): number`; `niceStep(domain): number`; `toAppliedRange(draft, domain): { priceMin?: number; priceMax?: number }`.

- [ ] **Step 1: Написать падающий тест**

```ts
import { clamp, niceStep, toAppliedRange } from './priceRange';

it('clamp ограничивает значение доменом', () => {
  expect(clamp(5, 0, 10)).toBe(5);
  expect(clamp(-3, 0, 10)).toBe(0);
  expect(clamp(99, 0, 10)).toBe(10);
});

it('niceStep ≈ 1/100 ширины, не меньше 1', () => {
  expect(niceStep({ min: 0, max: 1000 })).toBe(10);
  expect(niceStep({ min: 0, max: 50 })).toBe(1);
});

it('toAppliedRange: значения на краях домена → undefined (без границы)', () => {
  const domain = { min: 0, max: 1000 };
  expect(toAppliedRange({ min: 0, max: 1000 }, domain)).toEqual({ priceMin: undefined, priceMax: undefined });
  expect(toAppliedRange({ min: 200, max: 800 }, domain)).toEqual({ priceMin: 200, priceMax: 800 });
  expect(toAppliedRange({ min: 0, max: 800 }, domain)).toEqual({ priceMin: undefined, priceMax: 800 });
});
```

- [ ] **Step 2: Запустить — падает**

Run: `pnpm --filter @avino/client test -- priceRange`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Создать `priceRange.ts`**

```ts
export interface PriceDomain {
  min: number;
  max: number;
}
export interface PriceDraft {
  min: number;
  max: number;
}

/** Ограничивает значение отрезком [lo, hi]. */
export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Шаг слайдера ≈ 1/100 ширины домена, минимум 1. */
export function niceStep(domain: PriceDomain): number {
  return Math.max(1, Math.round((domain.max - domain.min) / 100));
}

/**
 * Применённый диапазон: значение на краю домена трактуется как «без границы»
 * (min на дне → нет нижней границы; max на потолке → overflow «max+»).
 */
export function toAppliedRange(
  draft: PriceDraft,
  domain: PriceDomain,
): { priceMin?: number; priceMax?: number } {
  return {
    priceMin: draft.min > domain.min ? draft.min : undefined,
    priceMax: draft.max < domain.max ? draft.max : undefined,
  };
}
```

- [ ] **Step 4: Запустить — проходит**

Run: `pnpm --filter @avino/client test -- priceRange`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/features/search/controls/priceRange.ts apps/client/src/features/search/controls/priceRange.test.ts
git commit -m "feat(client): price range pure helpers"
```

---

### Task B5: RTK Query эндпоинт распределения

**Files:**
- Create: `apps/client/src/store/api/priceDistributionApi.ts`

**Interfaces:**
- Consumes: `baseApi` (`@/store/api/baseApi`), типы `Currency`/`TransactionType` (`@/lib/mock/types`).
- Produces: `useGetPriceDistributionQuery`; типы `PriceBucket { from; to; count }`, `PriceDistribution { min; max; buckets: PriceBucket[]; overflowCount }`, `PriceDistributionArgs { currency: Currency; transactionType: TransactionType }`.

- [ ] **Step 1: Создать файл (паттерн `exchangeRateApi.ts`: snake→camel в `transformResponse`)**

```ts
/**
 * priceDistributionApi — RTK Query эндпоинт гистограммы цены публичного портала.
 * GET /api/v1/search/price-distribution?currency=&transaction_type= → бакеты.
 * snake_case DTO маппится в camelCase для UI.
 */
import { baseApi } from './baseApi';
import type { Currency, TransactionType } from '@/lib/mock/types';

export interface PriceBucket {
  from: number;
  to: number;
  count: number;
}
export interface PriceDistribution {
  min: number;
  max: number;
  buckets: PriceBucket[];
  overflowCount: number;
}
export interface PriceDistributionArgs {
  currency: Currency;
  transactionType: TransactionType;
}

interface PriceDistributionDto {
  currency: Currency;
  transaction_type: TransactionType;
  min: number;
  max: number;
  buckets: PriceBucket[];
  overflow_count: number;
}

export const priceDistributionApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getPriceDistribution: build.query<PriceDistribution, PriceDistributionArgs>({
      query: ({ currency, transactionType }) => ({
        url: '/search/price-distribution',
        params: { currency, transaction_type: transactionType },
      }),
      transformResponse: (dto: PriceDistributionDto): PriceDistribution => ({
        min: dto.min,
        max: dto.max,
        buckets: dto.buckets,
        overflowCount: dto.overflow_count,
      }),
    }),
  }),
  overrideExisting: false,
});

export const { useGetPriceDistributionQuery } = priceDistributionApi;
```

- [ ] **Step 2: Проверить компиляцию**

Run: `pnpm --filter @avino/client lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/client/src/store/api/priceDistributionApi.ts
git commit -m "feat(client): price distribution RTK Query endpoint"
```

---

### Task B6: Чистый компонент `PriceRangeControl` (гистограмма + слайдер + поля)

**Files:**
- Create: `apps/client/src/features/search/controls/PriceRangeControl.tsx`
- Test: `apps/client/src/features/search/controls/PriceRangeControl.test.tsx`

**Interfaces:**
- Consumes: `PriceDomain`/`PriceDraft`/`clamp`/`niceStep` (B4), `PriceBucket` (B5), `Field` (`@/components/ui/field`), `cn` (`@/lib/utils`), `radix-ui` `Slider`.
- Produces: компонент с props:
  ```ts
  interface PriceRangeControlProps {
    domain: PriceDomain;
    buckets: PriceBucket[];
    value: PriceDraft;
    onChange: (v: PriceDraft) => void;
    minLabel: string;
    maxLabel: string;
    fromPlaceholder: string;
    toPlaceholder: string;
    formatLabel: (v: number) => string;
  }
  ```

- [ ] **Step 1: Написать падающий тест (чистый компонент, без Redux/next-intl)**

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { it, expect, vi } from 'vitest';
import { PriceRangeControl } from './PriceRangeControl';

const base = {
  domain: { min: 0, max: 1000 },
  buckets: [
    { from: 0, to: 500, count: 4 },
    { from: 500, to: 1000, count: 2 },
  ],
  minLabel: 'Мин',
  maxLabel: 'Макс',
  fromPlaceholder: 'от $',
  toPlaceholder: 'до $',
  formatLabel: (v: number) => `$${v}`,
};

it('рендерит подписи домена и два поля', () => {
  render(<PriceRangeControl {...base} value={{ min: 0, max: 1000 }} onChange={vi.fn()} />);
  expect(screen.getByText('$0')).toBeInTheDocument();
  expect(screen.getByText('$1000+')).toBeInTheDocument();
  expect(screen.getByPlaceholderText('от $')).toBeInTheDocument();
  expect(screen.getByPlaceholderText('до $')).toBeInTheDocument();
});

it('ввод в поле «Мин» вызывает onChange с клампнутым значением', () => {
  const onChange = vi.fn();
  render(<PriceRangeControl {...base} value={{ min: 0, max: 1000 }} onChange={onChange} />);
  fireEvent.change(screen.getByPlaceholderText('от $'), { target: { value: '200' } });
  expect(onChange).toHaveBeenCalledWith({ min: 200, max: 1000 });
});

it('пустое поле «Макс» возвращает max к потолку домена', () => {
  const onChange = vi.fn();
  render(<PriceRangeControl {...base} value={{ min: 0, max: 800 }} onChange={onChange} />);
  fireEvent.change(screen.getByPlaceholderText('до $'), { target: { value: '' } });
  expect(onChange).toHaveBeenCalledWith({ min: 0, max: 1000 });
});
```

- [ ] **Step 2: Запустить — падает**

Run: `pnpm --filter @avino/client test -- PriceRangeControl`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Создать компонент**

```tsx
'use client';

import * as React from 'react';
import { Slider as RadixSlider } from 'radix-ui';
import { Field } from '@/components/ui/field';
import { cn } from '@/lib/utils';
import { clamp, niceStep, type PriceDomain, type PriceDraft } from './priceRange';
import type { PriceBucket } from '@/store/api/priceDistributionApi';

export interface PriceRangeControlProps {
  domain: PriceDomain;
  buckets: PriceBucket[];
  value: PriceDraft;
  onChange: (v: PriceDraft) => void;
  minLabel: string;
  maxLabel: string;
  fromPlaceholder: string;
  toPlaceholder: string;
  formatLabel: (v: number) => string;
}

export function PriceRangeControl({
  domain,
  buckets,
  value,
  onChange,
  minLabel,
  maxLabel,
  fromPlaceholder,
  toPlaceholder,
  formatLabel,
}: PriceRangeControlProps) {
  const maxCount = Math.max(1, ...buckets.map((b) => b.count));
  const step = niceStep(domain);

  return (
    <div className="flex flex-col gap-3">
      {/* Гистограмма: столбик внутри выбранного диапазона — бренд-красный, вне — приглушённый */}
      <div className="flex h-16 items-end gap-px" aria-hidden>
        {buckets.length === 0 ? (
          <div className="h-px w-full self-end bg-border" />
        ) : (
          buckets.map((b, i) => {
            const mid = (b.from + b.to) / 2;
            const inRange = mid >= value.min && mid <= value.max;
            return (
              <div
                key={i}
                className={cn('min-h-[2px] flex-1 rounded-sm', inRange ? 'bg-primary' : 'bg-primary/25')}
                style={{ height: `${(b.count / maxCount) * 100}%` }}
              />
            );
          })
        )}
      </div>

      {/* Слайдер с двумя ручками поверх базовой линии гистограммы */}
      <RadixSlider.Root
        className="relative flex h-5 w-full touch-none select-none items-center"
        min={domain.min}
        max={domain.max}
        step={step}
        value={[value.min, value.max]}
        onValueChange={([min, max]) => onChange({ min, max })}
        minStepsBetweenThumbs={1}
      >
        <RadixSlider.Track className="relative h-1 w-full grow rounded-full bg-border">
          <RadixSlider.Range className="absolute h-full rounded-full bg-primary" />
        </RadixSlider.Track>
        <RadixSlider.Thumb
          aria-label={minLabel}
          className="block h-5 w-5 rounded-full border-2 border-primary bg-surface shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <RadixSlider.Thumb
          aria-label={maxLabel}
          className="block h-5 w-5 rounded-full border-2 border-primary bg-surface shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </RadixSlider.Root>

      {/* Подписи краёв домена ($0 — $1M+) */}
      <div className="flex justify-between text-[13px] font-semibold text-ink">
        <span>{formatLabel(domain.min)}</span>
        <span>{formatLabel(domain.max)}+</span>
      </div>

      {/* Поля Мин/Макс */}
      <div className="flex items-end gap-2">
        <label className="flex-1">
          <span className="mb-1 block text-xs font-bold text-muted-foreground">{minLabel}</span>
          <Field
            inputMode="numeric"
            placeholder={fromPlaceholder}
            value={value.min > domain.min ? String(value.min) : ''}
            onChange={(e) => {
              const raw = e.target.value.trim();
              const next = raw === '' ? domain.min : clamp(Number(raw) || domain.min, domain.min, value.max);
              onChange({ min: next, max: value.max });
            }}
            className="py-2.5"
          />
        </label>
        <span className="pb-3 text-muted-foreground">–</span>
        <label className="flex-1">
          <span className="mb-1 block text-xs font-bold text-muted-foreground">{maxLabel}</span>
          <Field
            inputMode="numeric"
            placeholder={toPlaceholder}
            value={value.max < domain.max ? String(value.max) : ''}
            onChange={(e) => {
              const raw = e.target.value.trim();
              const next = raw === '' ? domain.max : clamp(Number(raw) || domain.max, value.min, domain.max);
              onChange({ min: value.min, max: next });
            }}
            className="py-2.5"
          />
        </label>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Запустить тест — проходит**

Run: `pnpm --filter @avino/client test -- PriceRangeControl`
Expected: PASS (3 теста).

> Если Radix `Slider` в jsdom бросает на отсутствии `ResizeObserver` — добавить полифилл в `vitest.setup.ts`:
> ```ts
> globalThis.ResizeObserver ||= class { observe(){} unobserve(){} disconnect(){} };
> ```
> (Коммитить вместе с тестом этой задачи, если потребуется.)

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/features/search/controls/PriceRangeControl.tsx apps/client/src/features/search/controls/PriceRangeControl.test.tsx
git commit -m "feat(client): PriceRangeControl (histogram + range slider + fields)"
```

---

### Task B7: Контейнер `PriceFilter` (Popover + вкладки + fetch)

**Files:**
- Create: `apps/client/src/features/search/PriceFilter.tsx`
- Modify: `apps/client/src/features/search/FilterBar.tsx` (добавить `export` к `TriggerButton`)

**Interfaces:**
- Consumes: `Popover`/`PopoverTrigger`/`PopoverContent` (B2), `useGetPriceDistributionQuery` (B5), `compactPrice` (B3), `toAppliedRange`/`clamp`/`PriceDomain`/`PriceDraft` (B4), `PriceRangeControl` (B6), `TriggerButton` (export из FilterBar), `useTranslations` (next-intl), типы `Currency`/`TransactionType`.
- Produces: компонент с props:
  ```ts
  interface PriceFilterProps {
    value: { priceMin?: string; priceMax?: string };
    tx: TransactionType;
    displayCurrency: Currency;
    currencySymbol: string;
    triggerLabel: string;
    active: boolean;
    onApply: (min: number | undefined, max: number | undefined, currency: Currency) => void;
    onReset: () => void;
  }
  ```

- [ ] **Step 1: Экспортировать `TriggerButton` из `FilterBar.tsx`**

Изменить строку 609 (`const TriggerButton = React.forwardRef<` → `export const TriggerButton = React.forwardRef<`). Больше ничего не трогать.

- [ ] **Step 2: Создать `PriceFilter.tsx`**

```tsx
'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { useGetPriceDistributionQuery } from '@/store/api/priceDistributionApi';
import { compactPrice } from '@/lib/format';
import { cn } from '@/lib/utils';
import { clamp, toAppliedRange, type PriceDomain, type PriceDraft } from './controls/priceRange';
import { PriceRangeControl } from './controls/PriceRangeControl';
import { TriggerButton } from './FilterBar';
import type { Currency, TransactionType } from '@/lib/mock/types';

/** Фолбэк-потолок домена, когда распределения ещё нет / пусто. */
const FALLBACK_MAX: Record<Currency, number> = {
  USD: 1_000_000,
  UZS: 12_000_000_000,
};

export interface PriceFilterProps {
  value: { priceMin?: string; priceMax?: string };
  tx: TransactionType;
  displayCurrency: Currency;
  currencySymbol: string;
  triggerLabel: string;
  active: boolean;
  onApply: (min: number | undefined, max: number | undefined, currency: Currency) => void;
  onReset: () => void;
}

export function PriceFilter(props: PriceFilterProps) {
  const [open, setOpen] = React.useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <TriggerButton label={props.triggerLabel} active={props.active} data-testid="filter-price" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[340px]">
        {/* Контент монтируется только при открытии → запрос распределения идёт по первому открытию */}
        <PriceFilterBody {...props} close={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}

function initDraft(value: { priceMin?: string; priceMax?: string }, domain: PriceDomain): PriceDraft {
  const min = value.priceMin ? clamp(Number(value.priceMin), domain.min, domain.max) : domain.min;
  const max = value.priceMax ? clamp(Number(value.priceMax), domain.min, domain.max) : domain.max;
  return { min, max };
}

function PriceFilterBody({
  value,
  tx,
  displayCurrency,
  currencySymbol,
  onApply,
  onReset,
  close,
}: PriceFilterProps & { close: () => void }) {
  const t = useTranslations('search.filters');
  const tUnits = useTranslations('units');
  const [tab, setTab] = React.useState<'list' | 'monthly'>('list');

  const { data } = useGetPriceDistributionQuery({ currency: displayCurrency, transactionType: tx });

  const domain: PriceDomain = React.useMemo(
    () => ({ min: 0, max: data && data.max > 0 ? data.max : FALLBACK_MAX[displayCurrency] }),
    [data, displayCurrency],
  );

  const [draft, setDraft] = React.useState<PriceDraft>(() => initDraft(value, domain));
  // Переинициализация при смене домена (валюта/сделка/загрузка данных).
  React.useEffect(() => {
    setDraft(initDraft(value, domain));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domain.max, displayCurrency, tx]);

  const apply = () => {
    const { priceMin, priceMax } = toAppliedRange(draft, domain);
    onApply(priceMin, priceMax, displayCurrency);
    close();
  };
  const reset = () => {
    onReset();
    close();
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Вкладки */}
      <div className="flex gap-1 rounded-pill border-[1.5px] border-border p-1">
        <button
          type="button"
          onClick={() => setTab('list')}
          className={cn(
            'flex-1 rounded-pill px-3 py-1.5 text-sm font-semibold transition-colors',
            tab === 'list' ? 'bg-mint text-teal' : 'text-muted-foreground',
          )}
        >
          {t('price')}
        </button>
        <button
          type="button"
          onClick={() => setTab('monthly')}
          className={cn(
            'flex-1 rounded-pill px-3 py-1.5 text-sm font-semibold transition-colors',
            tab === 'monthly' ? 'bg-mint text-teal' : 'text-muted-foreground',
          )}
        >
          {t('priceTabMonthly')}
        </button>
      </div>

      {tab === 'monthly' ? (
        <div className="py-8 text-center text-sm font-semibold text-muted-foreground">
          {t('priceTabMonthlySoon')}
        </div>
      ) : (
        <>
          <PriceRangeControl
            domain={domain}
            buckets={data?.buckets ?? []}
            value={draft}
            onChange={setDraft}
            minLabel={t('priceMinLabel')}
            maxLabel={t('priceMaxLabel')}
            fromPlaceholder={`${t('priceFrom')} ${currencySymbol}`}
            toPlaceholder={`${t('priceTo')} ${currencySymbol}`}
            formatLabel={(v) => compactPrice(v, displayCurrency, tUnits)}
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={reset}
              className="rounded-pill border-[1.5px] border-border px-4 py-2.5 text-sm font-semibold text-ink hover:border-ink"
            >
              {t('resetAll')}
            </button>
            <button
              type="button"
              onClick={apply}
              className="flex-1 rounded-pill bg-primary px-4 py-2.5 text-sm font-bold text-white"
            >
              {t('apply')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
```

> **Гоча `bg-primary text-white`:** красная кнопка. Проверить, что в `globals.css` есть utility `text-white`/`bg-primary`; если белый текст на красном недоступен — взять существующий primary-button-паттерн из проекта (см. кнопку «Применить» в `FiltersPanel`/`Button` с `variant`). Не вводить новый цвет.

- [ ] **Step 3: Проверить компиляцию**

Run: `pnpm --filter @avino/client lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/client/src/features/search/PriceFilter.tsx apps/client/src/features/search/FilterBar.tsx
git commit -m "feat(client): PriceFilter container (popover + tabs + distribution fetch)"
```

---

### Task B8: Встроить `PriceFilter` в `FilterBar` + очистка цены при смене валюты

**Files:**
- Modify: `apps/client/src/features/search/FilterBar.tsx`

**Interfaces:**
- Consumes: `PriceFilter` (B7), существующие `values`/`setParams`/`displayCurrency`/`currencySymbol`/`priceLabel`/`priceActive`.

- [ ] **Step 1: Импортировать `PriceFilter`**

В блок импортов FilterBar добавить:
```tsx
import { PriceFilter } from './PriceFilter';
```

- [ ] **Step 2: Заменить старый блок «Цена» (строки 418-448) на компонент**

```tsx
          {/* Цена — Zillow-вид (Popover + гистограмма + слайдер) */}
          <PriceFilter
            value={{ priceMin: values.priceMin, priceMax: values.priceMax }}
            tx={values.tx}
            displayCurrency={displayCurrency}
            currencySymbol={currencySymbol}
            triggerLabel={priceLabel}
            active={priceActive}
            onApply={(min, max, currency) =>
              setParams({
                priceMin: min,
                priceMax: max,
                currency: min != null || max != null ? currency : undefined,
              })
            }
            onReset={() => setParams({ priceMin: undefined, priceMax: undefined, currency: undefined })}
          />
```

> `setParams` уже удаляет ключи с `undefined`/`''` (строка 109). `min`/`max` — числа, `setParams` их строкует.

- [ ] **Step 3: Добавить эффект очистки цены при смене displayCurrency**

Сразу после объявления `displayCurrency`/`currencySymbol` (≈ строка 141) добавить:

```tsx
  // Цена задаётся в конкретной валюте; при смене сум/$ старый ценовой рубеж
  // становится бессмысленным (другой масштаб) — чистим priceMin/Max/currency.
  const prevCurrencyRef = React.useRef(displayCurrency);
  React.useEffect(() => {
    if (prevCurrencyRef.current === displayCurrency) return;
    prevCurrencyRef.current = displayCurrency;
    if (values.priceMin || values.priceMax) {
      setParams({ priceMin: undefined, priceMax: undefined, currency: undefined });
    }
  }, [displayCurrency, values.priceMin, values.priceMax, setParams]);
```

- [ ] **Step 4: Сборка + существующие тесты FilterBar/контролов зелёные**

Run: `pnpm --filter @avino/client test -- FilterBar` затем `pnpm --filter @avino/client build`
Expected: тесты PASS (или предсуществующие 2 фейла LoginModal — не регресс); build PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/features/search/FilterBar.tsx
git commit -m "feat(client): wire PriceFilter into FilterBar + clear price on currency switch"
```

---

### Task B9: SSR-фикс — `currency` доезжает до бэкенда

**Files:**
- Modify: `apps/client/src/lib/api/listings.ts` (`buildSearchParams`)
- Modify: `apps/client/src/app/[locale]/search/page.tsx` (парсинг `currency`)

**Interfaces:**
- Consumes: тип `Currency` (`@/lib/mock/types`), поле `ListingFilter.currency` (уже существует).

- [ ] **Step 1: В `buildSearchParams` отправлять `currency` при ценовом рубеже**

`apps/client/src/lib/api/listings.ts`, сразу после строки 390 (`if (filter.priceMax != null) params.set('price_max', …)`):

```ts
  // Валюта ценового диапазона — только когда задан хотя бы один рубеж (зеркало
  // searchApi.filterParams; без рубежа валюта исключила бы объявления зря).
  if (filter.currency && (filter.priceMin != null || filter.priceMax != null)) {
    params.set('currency', filter.currency);
  }
```

- [ ] **Step 2: Парсить `currency` из URL в `search/page.tsx` и класть в `filter`**

После парсинга цены (строки 158-161) добавить:

```ts
  const currencyRaw = first(sp.currency);
  const currency: 'UZS' | 'USD' | undefined =
    currencyRaw === 'USD' || currencyRaw === 'UZS' ? currencyRaw : undefined;
```

И в объект `const filter: ListingFilter = { … }` (≈ строка 208) добавить поле:

```ts
    currency,
```

- [ ] **Step 3: Сборка зелёная**

Run: `pnpm --filter @avino/client build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/client/src/lib/api/listings.ts "apps/client/src/app/[locale]/search/page.tsx"
git commit -m "fix(client): send currency with price filter on SSR (no UZS/USD mixing)"
```

---

### Task B10: Финал клиента — DONE + ручная проверка

**Files:**
- Modify: `docs/DONE.md` (если ведётся)

**Interfaces:** —

- [ ] **Step 1: Полный прогон тестов и линта клиента**

Run: `pnpm --filter @avino/client test` затем `pnpm --filter @avino/client lint`
Expected: новые тесты (format.compactPrice, priceRange, PriceRangeControl) зелёные; предсуществующие 2 фейла `LoginModal.test.tsx` допустимы (известный долг, НЕ регресс); lint без ошибок в новых файлах.

- [ ] **Step 2: Ручная проверка (live)**

Поднять API (с применёнными миграциями и сидом каталога) + client. Открыть `/search`:
- Клик по «Цена» открывает Popover с заголовком-вкладками; видна гистограмма (если в сиде есть USD/UZS-цены) или ровная база.
- Вкладка «Ежемесячный платёж» показывает «Скоро».
- Перетаскивание ручек слайдера двигает выделение и подсвечивает столбики; поля Мин/Макс синхронны.
- «Применить» пишет `priceMin/priceMax/currency` в URL и меняет выдачу; чип цены появляется.
- Переключение сум/$ в шапке очищает активный ценовой фильтр и перерисовывает гистограмму под новую валюту.

- [ ] **Step 3: Commit (DONE)**

```bash
git add docs/DONE.md
git commit -m "docs(client): mark Zillow price filter done"
```

---

## Self-Review

**Spec coverage:**
- §A эндпоинт распределения → A1 (DTO), A2 (сервис+SQL: p99/width_bucket/overflow), A3 (роут), A4 (валидация 400), A5 (openapi/ADR). ✅
- §A видимость ACTIVE → A2 `status = 'ACTIVE'` в `where`. ✅
- §A response в `*.dto.ts` + snake_case → A1. ✅
- §B Popover вместо DropdownMenu → B2 + B7. ✅
- §B вкладки (Цена / Monthly «Скоро») → B7. ✅
- §B гистограмма + degrade → B6 (пустые buckets → базовая линия). ✅
- §B слайдер (2 ручки, overflow) → B6 + B4 (`toAppliedRange`). ✅
- §B поля Мин/Макс → B6. ✅
- §B «Применить»/«Сбросить» + draft → B7. ✅
- §B валюта = displayCurrency, refetch по смене → B7 (`useGetPriceDistributionQuery` ключ + эффект reinit) + B8 (очистка). ✅
- §B.8 фикс currency (SSR) → B9. ✅
- §B.9 i18n → B1. ✅
- Краевые случаи (пусто/один бакет/смена валюты/overflow) → B6/B7/B8. ✅

**Placeholder scan:** код приведён в каждом шаге; «TODO/TBD» нет. Два явно помеченных места требуют сверки с проектом, а не доработки «потом»: openapi dummy-env (A5 — читается из скрипта) и primary-button utility (B7 — сверить `bg-primary/text-white` с существующим паттерном). ✅

**Type consistency:** `PriceDomain`/`PriceDraft`/`PriceBucket` едины между B4/B5/B6/B7; `priceDistribution`/`PriceDistributionResponseDto` совпадают A2↔A1↔A3; `getPriceDistribution`→`useGetPriceDistributionQuery` (B5) потребляется в B7; `currency` snake_case в DTO (A1) ↔ `transformResponse` snake→camel (B5). ✅

---

## Execution Handoff

**Порядок:** PR A (Tasks A1–A5) и PR B (Tasks B1–B10) независимы по файлам, но PR B даёт полноценную гистограмму только с задеплоенным PR A (без него — graceful degradation: слайдер/поля работают на фолбэк-домене). Рекомендуется сперва смёржить A, затем B; либо вести параллельно в двух ветках.
