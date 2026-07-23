# Address Normalization + ru/en Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Чистый формат адреса объявления («Ташкент, Мирзо-Улугбек, ул. Бабура, 13») в ru и en, выдача по языку запроса; uz — фолбэк на ru.

**Architecture:** Серверный Yandex HTTP Geocoder (два запроса ru_RU/en_US по lat/lng) при create/update объявления; формат собирается из структурных компонентов + района из НАШЕЙ таблицы `districts`. Строковый фолбэк-нормализатор чистит присланный адрес, когда геокодер недоступен. `address` (ru, канон, `q` ILIKE не меняется) + новая колонка `listings.address_en`; выдача (search list + detail) подменяет по резолвнутому языку.

**Tech Stack:** NestJS 10, Prisma, PostgreSQL, глобальный `fetch` (Node ≥ 20), Jest.

**Спека:** `docs/superpowers/specs/2026-07-13-address-normalization-design.md` (одобрена Tommy 2026-07-13).

## Global Constraints

- Все bash-команды через `rtk` (см. ~/.claude/RTK.md); git-мутации по одной команде.
- Работа ТОЛЬКО в `apps/api` (+ корневой docker-compose.yml, docs). Клиент в PR-2 не трогаем — адрес приходит с сервера.
- main защищён: только PR, мёржит Tommy. ADR — в своей feature-PR.
- `pnpm --filter @avino/api lint`, `test` — GREEN перед каждым commit.
- Ключ: env `YANDEX_MAPS_API_KEY` (конфиг `maps.yandexApiKey` уже существует, `configuration.ts:58`). Entitlement проверен curl'ом 2026-07-13 — ru_RU и en_US работают с текущим ключом JS API (`e33f…2358`).
- Пустой ключ → резолвер отключён → строковый фолбэк. Создание объявления НИКОГДА не падает из-за геокодера.
- После смены schema.prisma: `rtk prisma generate` (иначе ~37 криптичных TS-ошибок — известная гоча).

---

## PR-1 — ветка `feat/address-normalization` (base: main)

### Task 1: Чистые хелперы формата адреса

**Files:**
- Create: `apps/api/src/geo/address-format.ts`
- Test: `apps/api/src/geo/address-format.spec.ts`
- Modify: `apps/api/src/geo/index.ts` (реэкспорт)

**Interfaces (Produces):**
```ts
export interface AddressParts {
  locality?: string | null;
  district?: string | null;
  street?: string | null;
  house?: string | null;
}
export interface GeoParts { locality: string | null; street: string | null; house: string | null }
export function stripCityPrefix(name: string): string;      // «город Ташкент»/«г. Ташкент» → «Ташкент»
export function abbreviateStreetRu(street: string): string; // «улица Сеул» → «ул. Сеул»
export function formatAddress(parts: AddressParts): string; // join непустых через ', '
export function normalizeAddress(raw: string): string;      // строковый фолбэк-нормализатор
export function extractGeoParts(json: unknown): GeoParts | null; // парсер ответа геокодера
```

- [ ] **Step 1: Написать падающие тесты**

```ts
// apps/api/src/geo/address-format.spec.ts
import {
  abbreviateStreetRu,
  extractGeoParts,
  formatAddress,
  normalizeAddress,
  stripCityPrefix,
} from './address-format';

describe('stripCityPrefix', () => {
  it.each([
    ['город Ташкент', 'Ташкент'],
    ['г. Ташкент', 'Ташкент'],
    ['Ташкент', 'Ташкент'],
    ['Самарканд', 'Самарканд'],
  ])('%s → %s', (input, expected) => {
    expect(stripCityPrefix(input)).toBe(expected);
  });
});

describe('abbreviateStreetRu', () => {
  it.each([
    ['улица Сеул', 'ул. Сеул'],
    ['проспект Амира Темура', 'просп. Амира Темура'],
    ['переулок Тихий', 'пер. Тихий'],
    ['бульвар Мустакиллик', 'бул. Мустакиллик'],
    ['площадь Регистан', 'пл. Регистан'],
    ['ул. Бабура', 'ул. Бабура'], // уже сокращено — не трогаем
    ['Seul koʻchasi', 'Seul koʻchasi'], // en/uz — не трогаем
  ])('%s → %s', (input, expected) => {
    expect(abbreviateStreetRu(input)).toBe(expected);
  });
});

describe('formatAddress', () => {
  it('склеивает непустые части через запятую', () => {
    expect(
      formatAddress({ locality: 'Ташкент', district: 'Мирзо-Улугбек', street: 'ул. Бабура', house: '13' }),
    ).toBe('Ташкент, Мирзо-Улугбек, ул. Бабура, 13');
  });
  it('пропускает null/undefined/пустые части', () => {
    expect(formatAddress({ locality: 'Ташкент', district: null, street: 'ул. Бабура', house: '' })).toBe(
      'Ташкент, ул. Бабура',
    );
  });
  it('все части пусты → пустая строка', () => {
    expect(formatAddress({})).toBe('');
  });
});

describe('normalizeAddress', () => {
  it('срезает «город», страну и хвост-дубль района/города (кейс Tommy)', () => {
    expect(
      normalizeAddress('город Ташкент, Мирзо-Улугбек, ул. Бабура, 13, Мирзо-Улугбек р-н, Ташкент'),
    ).toBe('Ташкент, Мирзо-Улугбек, ул. Бабура, 13');
  });
  it('срезает «Узбекистан» и сокращает «улица»', () => {
    expect(normalizeAddress('Узбекистан, Ташкент, Чиланзарский район, улица Сеул, 7/1')).toBe(
      'Ташкент, Чиланзарский район, ул. Сеул, 7/1',
    );
  });
  it('дедупит «-ский район» против голого имени района', () => {
    expect(normalizeAddress('Ташкент, Мирзо-Улугбек, ул. Бабура, 13, Мирзо-Улугбекский район')).toBe(
      'Ташкент, Мирзо-Улугбек, ул. Бабура, 13',
    );
  });
  it('англ. страна/район: Uzbekistan и Chilanzar District', () => {
    expect(normalizeAddress('Uzbekistan, Tashkent, Chilanzar District, Seul koʻchasi, 7/1')).toBe(
      'Tashkent, Chilanzar District, Seul koʻchasi, 7/1',
    );
  });
  it('идемпотентна', () => {
    const once = normalizeAddress('город Ташкент, Мирзо-Улугбек, ул. Бабура, 13, Мирзо-Улугбек р-н, Ташкент');
    expect(normalizeAddress(once)).toBe(once);
  });
  it('чистая строка проходит без изменений', () => {
    expect(normalizeAddress('Ташкент, Юнусабад, массив Файзли, 18')).toBe('Ташкент, Юнусабад, массив Файзли, 18');
  });
});

describe('extractGeoParts', () => {
  // Реальная форма ответа HTTP Геокодера (curl-проверка 2026-07-13).
  const geocoderJson = (components: Array<{ kind: string; name: string }>) => ({
    response: {
      GeoObjectCollection: {
        featureMember: [
          {
            GeoObject: {
              metaDataProperty: { GeocoderMetaData: { Address: { Components: components } } },
            },
          },
        ],
      },
    },
  });

  it('вытаскивает locality/street/house', () => {
    expect(
      extractGeoParts(
        geocoderJson([
          { kind: 'country', name: 'Узбекистан' },
          { kind: 'province', name: 'Ташкент' },
          { kind: 'locality', name: 'Ташкент' },
          { kind: 'district', name: 'Чиланзарский район' },
          { kind: 'district', name: 'махаллинский сход граждан Бешагач' },
          { kind: 'street', name: 'улица Сеул' },
          { kind: 'house', name: '7/1' },
        ]),
      ),
    ).toEqual({ locality: 'Ташкент', street: 'улица Сеул', house: '7/1' });
  });
  it('нет locality → берёт province', () => {
    expect(
      extractGeoParts(geocoderJson([{ kind: 'province', name: 'Ташкентская область' }, { kind: 'street', name: 'улица Навои' }])),
    ).toEqual({ locality: 'Ташкентская область', street: 'улица Навои', house: null });
  });
  it('пустой featureMember → null', () => {
    expect(
      extractGeoParts({ response: { GeoObjectCollection: { featureMember: [] } } }),
    ).toBeNull();
  });
  it('мусорный json → null', () => {
    expect(extractGeoParts({})).toBeNull();
    expect(extractGeoParts(null)).toBeNull();
  });
});
```

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `cd /Users/founder/Desktop/hermes/projects/avino && pnpm --filter @avino/api test -- address-format`
Expected: FAIL — «Cannot find module './address-format'».

- [ ] **Step 3: Реализация**

```ts
// apps/api/src/geo/address-format.ts
/**
 * address-format — чистые функции формата адреса объявления (ADR-0147).
 *
 * Канонический формат: `{locality}, {district}, {street}, {house}` — без страны,
 * без «город », без дублей района/города в хвосте. Используются AddressResolverService
 * (структурные компоненты Yandex HTTP Geocoder) и строковым фолбэком в ListingsService.
 */

export interface AddressParts {
  locality?: string | null;
  district?: string | null;
  street?: string | null;
  house?: string | null;
}

export interface GeoParts {
  locality: string | null;
  street: string | null;
  house: string | null;
}

/** Страны, выбрасываемые нормализатором (ru/en/uz-latin написания). */
const COUNTRY_PARTS = new Set(['узбекистан', 'uzbekistan', "o'zbekiston", 'ozbekiston', 'oʻzbekiston']);

const RU_STREET_ABBREVIATIONS: ReadonlyArray<[RegExp, string]> = [
  [/^улица\s+/i, 'ул. '],
  [/^проспект\s+/i, 'просп. '],
  [/^переулок\s+/i, 'пер. '],
  [/^бульвар\s+/i, 'бул. '],
  [/^площадь\s+/i, 'пл. '],
];

/** «город Ташкент» / «г. Ташкент» → «Ташкент». */
export function stripCityPrefix(name: string): string {
  return name.replace(/^(город|г\.)\s+/i, '').trim();
}

/** «улица Сеул» → «ул. Сеул»; уже сокращённое и не-русское — как есть. */
export function abbreviateStreetRu(street: string): string {
  for (const [pattern, abbr] of RU_STREET_ABBREVIATIONS) {
    if (pattern.test(street)) {
      return street.replace(pattern, abbr);
    }
  }
  return street;
}

/** Склейка непустых частей канонического формата через ', '. */
export function formatAddress(parts: AddressParts): string {
  return [parts.locality, parts.district, parts.street, parts.house]
    .map((p) => p?.trim())
    .filter(Boolean)
    .join(', ');
}

/**
 * Ключ сравнения части адреса для дедупа: lower, ё→е, без хвостов
 * « р-н»/« район»/« district» и суффикса «ский» («Мирзо-Улугбекский район» ≈
 * «Мирзо-Улугбек р-н» ≈ «Мирзо-Улугбек»).
 */
function canonPart(part: string): string {
  return part
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/\s+(р-н|район|district)$/i, '')
    .replace(/ский$/i, '')
    .trim();
}

/**
 * Строковый фолбэк-нормализатор: чистит присланную строку адреса, когда
 * геокодер недоступен. Выбрасывает страну, срезает «город »-префиксы,
 * сокращает «улица …», выбрасывает части-дубли (хвост «…р-н, Ташкент»
 * от Yandex Suggest displayName). Идемпотентен.
 */
export function normalizeAddress(raw: string): string {
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const rawPart of raw.split(',')) {
    let part = rawPart.trim();
    if (!part) continue;
    if (COUNTRY_PARTS.has(part.toLowerCase())) continue;
    part = abbreviateStreetRu(stripCityPrefix(part));
    const key = canonPart(part);
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(part);
  }
  return kept.join(', ');
}

/** Компонент структурного адреса в ответе HTTP Геокодера. */
interface GeocoderComponent {
  kind?: unknown;
  name?: unknown;
}

/**
 * Достаёт locality/street/house из ответа Yandex HTTP Geocoder
 * (`GeoObject.metaDataProperty.GeocoderMetaData.Address.Components`).
 * Нет компонентов → null (вызывающий уходит в строковый фолбэк).
 */
export function extractGeoParts(json: unknown): GeoParts | null {
  const components = (json as {
    response?: {
      GeoObjectCollection?: {
        featureMember?: Array<{
          GeoObject?: {
            metaDataProperty?: {
              GeocoderMetaData?: { Address?: { Components?: unknown } };
            };
          };
        }>;
      };
    };
  })?.response?.GeoObjectCollection?.featureMember?.[0]?.GeoObject
    ?.metaDataProperty?.GeocoderMetaData?.Address?.Components;
  if (!Array.isArray(components)) {
    return null;
  }
  const names = (kind: string): string[] =>
    (components as GeocoderComponent[])
      .filter((c) => c.kind === kind && typeof c.name === 'string')
      .map((c) => c.name as string);
  // .at(-1): у kind=district их несколько (район + махалля) — берём НЕ их;
  // locality обычно один, для province последний — самый специфичный.
  const locality = names('locality').at(-1) ?? names('province').at(-1) ?? null;
  return {
    locality,
    street: names('street').at(-1) ?? null,
    house: names('house').at(-1) ?? null,
  };
}
```

В `apps/api/src/geo/index.ts` добавить строку-реэкспорт (рядом с существующими):
```ts
export * from './address-format';
```

- [ ] **Step 4: Тесты зелёные**

Run: `pnpm --filter @avino/api test -- address-format`
Expected: PASS (все describe).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/geo/address-format.ts apps/api/src/geo/address-format.spec.ts apps/api/src/geo/index.ts
git commit -m "feat(api): address format helpers — normalize + geocoder parts (ADR-0147)"
```

---

### Task 2: Миграция `listings.address_en`

**Files:**
- Create: `apps/api/prisma/migrations/20260713060000_add_listing_address_en/migration.sql`
- Modify: `apps/api/prisma/schema.prisma` (модель `Listing`, рядом с `address` на строке ~490)

**Interfaces (Produces):** поле Prisma `Listing.addressEn: string | null` (`address_en VARCHAR(500)`).

- [ ] **Step 1: SQL миграции**

```sql
-- Английская версия адреса объявления (ADR-0147). NULL = перевода нет,
-- выдача фолбэкает на канонический русский listings.address.
ALTER TABLE "listings" ADD COLUMN "address_en" VARCHAR(500);
```

- [ ] **Step 2: schema.prisma**

В модели `Listing` сразу после строки `address String? @db.VarChar(500)`:

```prisma
  addressEn          String?                                @map("address_en") @db.VarChar(500)
```

- [ ] **Step 3: Применить и перегенерить клиент**

Run (локальный стек db должен работать; если нет — `docker compose up -d db`):
```bash
pnpm --filter @avino/api exec prisma migrate deploy
pnpm --filter @avino/api exec prisma generate
```
Expected: `1 migration applied`, `Generated Prisma Client`.

- [ ] **Step 4: Билд не сломан**

Run: `pnpm --filter @avino/api build`
Expected: успех без TS-ошибок.

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260713060000_add_listing_address_en
git commit -m "feat(api): listings.address_en column (ADR-0147)"
```

---

### Task 3: AddressResolverService (Yandex HTTP Geocoder ru+en)

**Files:**
- Create: `apps/api/src/geo/address-resolver.service.ts`
- Test: `apps/api/src/geo/address-resolver.service.spec.ts`
- Modify: `apps/api/src/geo/geo.module.ts` (providers/exports + import ConfigModule не нужен — ConfigModule глобальный), `apps/api/src/geo/index.ts`

**Interfaces:**
- Consumes: `extractGeoParts`, `formatAddress`, `stripCityPrefix`, `abbreviateStreetRu` (Task 1); `DistrictsService.namesByIds` (существует); конфиг `maps.yandexApiKey`.
- Produces:
```ts
export interface ResolvedAddress { address: string; addressEn: string | null }
class AddressResolverService {
  resolve(lat: string, lng: string, districtId?: string | null): Promise<ResolvedAddress | null>;
}
```
`null` = геокодер недоступен/пустой ответ → вызывающий применяет строковый фолбэк.

- [ ] **Step 1: Падающие тесты**

```ts
// apps/api/src/geo/address-resolver.service.spec.ts
import { ConfigService } from '@nestjs/config';
import { AddressResolverService } from './address-resolver.service';
import { DistrictsService } from './districts.service';

/**
 * Юнит-тесты AddressResolverService (ADR-0147): fetch мокается глобально,
 * проверяются сборка формата ru/en, фолбэк без ключа/при сбое, подстановка
 * района из НАШЕЙ таблицы districts.
 */
describe('AddressResolverService', () => {
  const geocoderBody = (components: Array<{ kind: string; name: string }>) => ({
    response: {
      GeoObjectCollection: {
        featureMember: [
          { GeoObject: { metaDataProperty: { GeocoderMetaData: { Address: { Components: components } } } } },
        ],
      },
    },
  });

  const RU_COMPONENTS = [
    { kind: 'country', name: 'Узбекистан' },
    { kind: 'locality', name: 'Ташкент' },
    { kind: 'district', name: 'Чиланзарский район' },
    { kind: 'street', name: 'улица Сеул' },
    { kind: 'house', name: '7/1' },
  ];
  const EN_COMPONENTS = [
    { kind: 'country', name: 'Uzbekistan' },
    { kind: 'locality', name: 'Tashkent' },
    { kind: 'district', name: 'Chilanzar District' },
    { kind: 'street', name: 'Seul koʻchasi' },
    { kind: 'house', name: '7/1' },
  ];

  let districts: { namesByIds: jest.Mock };
  let fetchMock: jest.SpyInstance;

  const makeService = (apiKey: string | undefined) => {
    const config = { get: jest.fn().mockReturnValue(apiKey) } as unknown as ConfigService;
    return new AddressResolverService(config, districts as unknown as DistrictsService);
  };

  beforeEach(() => {
    districts = { namesByIds: jest.fn().mockResolvedValue(new Map()) };
    fetchMock = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  const okResponse = (body: unknown) =>
    ({ ok: true, json: () => Promise.resolve(body) }) as unknown as Response;

  it('без ключа → null, fetch не вызывается', async () => {
    const service = makeService(undefined);
    await expect(service.resolve('41.2995', '69.2401')).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('собирает ru+en с районом из БД', async () => {
    fetchMock.mockImplementation((url: RequestInfo | URL) =>
      Promise.resolve(
        okResponse(String(url).includes('lang=en_US') ? geocoderBody(EN_COMPONENTS) : geocoderBody(RU_COMPONENTS)),
      ),
    );
    districts.namesByIds.mockResolvedValue(
      new Map([['d1', { nameUz: 'Chilonzor', nameRu: 'Чиланзар', nameEn: 'Chilanzar' }]]),
    );
    const service = makeService('test-key');
    await expect(service.resolve('41.2995', '69.2401', 'd1')).resolves.toEqual({
      address: 'Ташкент, Чиланзар, ул. Сеул, 7/1',
      addressEn: 'Tashkent, Chilanzar, Seul koʻchasi, 7/1',
    });
    // geocode=lng,lat (longlat-порядок Яндекса)
    expect(String(fetchMock.mock.calls[0][0])).toContain('geocode=69.2401%2C41.2995');
  });

  it('без district_id — район опускается', async () => {
    fetchMock.mockImplementation((url: RequestInfo | URL) =>
      Promise.resolve(
        okResponse(String(url).includes('lang=en_US') ? geocoderBody(EN_COMPONENTS) : geocoderBody(RU_COMPONENTS)),
      ),
    );
    const service = makeService('test-key');
    await expect(service.resolve('41.2995', '69.2401')).resolves.toEqual({
      address: 'Ташкент, ул. Сеул, 7/1',
      addressEn: 'Tashkent, Seul koʻchasi, 7/1',
    });
  });

  it('ru-запрос упал → null (фолбэк вызывающего)', async () => {
    fetchMock.mockRejectedValue(new Error('network'));
    const service = makeService('test-key');
    await expect(service.resolve('41.2995', '69.2401')).resolves.toBeNull();
  });

  it('en упал, ru ок → addressEn null', async () => {
    fetchMock.mockImplementation((url: RequestInfo | URL) =>
      String(url).includes('lang=en_US')
        ? Promise.reject(new Error('network'))
        : Promise.resolve(okResponse(geocoderBody(RU_COMPONENTS))),
    );
    const service = makeService('test-key');
    await expect(service.resolve('41.2995', '69.2401')).resolves.toEqual({
      address: 'Ташкент, ул. Сеул, 7/1',
      addressEn: null,
    });
  });

  it('пустой ответ геокодера (нет компонентов) → null', async () => {
    fetchMock.mockResolvedValue(okResponse({ response: { GeoObjectCollection: { featureMember: [] } } }));
    const service = makeService('test-key');
    await expect(service.resolve('41.2995', '69.2401')).resolves.toBeNull();
  });
});
```

- [ ] **Step 2: Тесты падают**

Run: `pnpm --filter @avino/api test -- address-resolver`
Expected: FAIL — «Cannot find module './address-resolver.service'».

- [ ] **Step 3: Реализация**

```ts
// apps/api/src/geo/address-resolver.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Language } from '@prisma/client';
import {
  abbreviateStreetRu,
  extractGeoParts,
  formatAddress,
  stripCityPrefix,
  type GeoParts,
} from './address-format';
import { DistrictsService } from './districts.service';

/** Результат резолва: канонический ru-адрес + английская версия (или null). */
export interface ResolvedAddress {
  address: string;
  addressEn: string | null;
}

const GEOCODER_URL = 'https://geocode-maps.yandex.ru/1.x/';
const GEOCODER_TIMEOUT_MS = 3_000;

/**
 * AddressResolverService — реверс-геокод адреса объявления через Yandex HTTP
 * Geocoder (ADR-0147). Два параллельных запроса (ru_RU + en_US) по координатам;
 * формат собирается из структурных Components, район подставляется из НАШЕЙ
 * таблицы districts (трёхъязычна, консистентна с фильтрами).
 *
 * Best-effort: нет ключа / сеть / пустой ответ → null, вызывающий применяет
 * строковый фолбэк normalizeAddress. Создание объявления никогда не блокируется.
 * uz не запрашивается — Яндекс его не поддерживает (спека 2026-07-13).
 */
@Injectable()
export class AddressResolverService {
  private readonly logger = new Logger(AddressResolverService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly districts: DistrictsService,
  ) {}

  async resolve(
    lat: string,
    lng: string,
    districtId?: string | null,
  ): Promise<ResolvedAddress | null> {
    const apiKey = this.config.get<string>('maps.yandexApiKey');
    if (!apiKey) {
      return null;
    }
    const [ru, en] = await Promise.all([
      this.geocode(apiKey, lat, lng, 'ru_RU'),
      this.geocode(apiKey, lat, lng, 'en_US'),
    ]);
    if (!ru) {
      return null;
    }
    const districtNames = districtId
      ? (await this.districts.namesByIds([districtId])).get(districtId)
      : undefined;
    const address = formatAddress({
      locality: ru.locality ? stripCityPrefix(ru.locality) : null,
      district: this.districts.pickName(districtNames, Language.RU),
      street: ru.street ? abbreviateStreetRu(ru.street) : null,
      house: ru.house,
    });
    if (!address) {
      return null;
    }
    const addressEn = en
      ? formatAddress({
          locality: en.locality,
          district: this.districts.pickName(districtNames, Language.EN),
          street: en.street,
          house: en.house,
        })
      : '';
    return { address, addressEn: addressEn || null };
  }

  /** Один запрос к геокодеру; любая осечка → null (best-effort, warn в лог). */
  private async geocode(
    apiKey: string,
    lat: string,
    lng: string,
    lang: 'ru_RU' | 'en_US',
  ): Promise<GeoParts | null> {
    const params = new URLSearchParams({
      apikey: apiKey,
      geocode: `${lng},${lat}`, // longlat-порядок Яндекса
      sco: 'longlat',
      kind: 'house',
      format: 'json',
      results: '1',
      lang,
    });
    try {
      const res = await fetch(`${GEOCODER_URL}?${params}`, {
        signal: AbortSignal.timeout(GEOCODER_TIMEOUT_MS),
      });
      if (!res.ok) {
        this.logger.warn(`Geocoder ${lang} responded ${res.status}`);
        return null;
      }
      return extractGeoParts(await res.json());
    } catch (e) {
      this.logger.warn(`Geocoder ${lang} failed: ${(e as Error).message}`);
      return null;
    }
  }
}
```

В `geo.module.ts` добавить `AddressResolverService` в `providers` и `exports`; в `geo/index.ts` — `export * from './address-resolver.service';`.

- [ ] **Step 4: Тесты зелёные**

Run: `pnpm --filter @avino/api test -- address-resolver`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/geo/address-resolver.service.ts apps/api/src/geo/address-resolver.service.spec.ts apps/api/src/geo/geo.module.ts apps/api/src/geo/index.ts
git commit -m "feat(api): AddressResolverService — Yandex HTTP Geocoder ru+en (ADR-0147)"
```

---

### Task 4: Хуки в ListingsService.create/update

**Files:**
- Modify: `apps/api/src/listings/listings.service.ts` (конструктор; `create` ~458; `update` ~604–632)
- Test: `apps/api/src/listings/listings.service.spec.ts` (конструктор моков ~124 + новые кейсы)

**Interfaces:**
- Consumes: `AddressResolverService.resolve(lat, lng, districtId?)` (Task 3), `normalizeAddress` (Task 1), `Listing.addressEn` (Task 2).
- Produces: правила записи адреса:
  - create/update с координатами в dto → геокод; успех → `address` (ru) + `addressEn`;
  - геокодер молчит → `address = normalizeAddress(dto.address)`, `addressEn = null`;
  - update: правка ТОЛЬКО текста адреса (без координат) → normalizeAddress, БЕЗ ре-геокода (уважение ручной правки), `addressEn = null`;
  - dto без адреса и без координат → ничего не трогаем.

- [ ] **Step 1: Падающие тесты** — добавить в `listings.service.spec.ts`:

В `beforeEach` добавить стаб (рядом со стабом `districts`):
```ts
    // AddressResolver (ADR-0147): дефолт «геокодер недоступен» (null) — базовые
    // тесты create идут строковым фолбэком; геокод-кейсы переопределяют resolve.
    addressResolver = { resolve: jest.fn().mockResolvedValue(null) };
```
объявить рядом с `activeLimit`: `let addressResolver: { resolve: jest.Mock };`
и передать шестым аргументом конструктора:
```ts
    service = new ListingsService(
      prisma,
      new TranslationsService(prisma),
      districts,
      uploads,
      activeLimit as unknown as ActiveListingLimitService,
      addressResolver as unknown as AddressResolverService,
    );
```
импорт: `import { AddressResolverService } from '../geo';` (уже есть импорт из '../geo' — расширить).

Новый describe:
```ts
  describe('address resolution (ADR-0147)', () => {
    beforeEach(() => {
      prisma.listing.create.mockResolvedValue(dbListing);
    });

    it('create с координатами: геокод успешен → address ru + addressEn', async () => {
      addressResolver.resolve.mockResolvedValue({
        address: 'Ташкент, Чиланзар, ул. Сеул, 7/1',
        addressEn: 'Tashkent, Chilanzar, Seul koʻchasi, 7/1',
      });
      await service.create(OWNER_ID, {
        ...validCreate,
        address: 'город Ташкент, Чиланзар, улица Сеул, 7/1, Чиланзарский р-н',
        latitude: '41.299500',
        longitude: '69.240100',
        district_id: 'd1',
      } as any);
      expect(addressResolver.resolve).toHaveBeenCalledWith('41.299500', '69.240100', 'd1');
      const data = prisma.listing.create.mock.calls[0][0].data;
      expect(data.address).toBe('Ташкент, Чиланзар, ул. Сеул, 7/1');
      expect(data.addressEn).toBe('Tashkent, Chilanzar, Seul koʻchasi, 7/1');
    });

    it('create: геокодер молчит → строковый фолбэк, addressEn null', async () => {
      await service.create(OWNER_ID, {
        ...validCreate,
        address: 'город Ташкент, Мирзо-Улугбек, ул. Бабура, 13, Мирзо-Улугбек р-н, Ташкент',
        latitude: '41.325000',
        longitude: '69.295000',
      } as any);
      const data = prisma.listing.create.mock.calls[0][0].data;
      expect(data.address).toBe('Ташкент, Мирзо-Улугбек, ул. Бабура, 13');
      expect(data.addressEn).toBeNull();
    });

    it('create без координат: только нормализация, геокодер не зовётся', async () => {
      await service.create(OWNER_ID, {
        ...validCreate,
        address: 'Узбекистан, Ташкент, Юнусабад, массив Файзли, 18',
      } as any);
      expect(addressResolver.resolve).not.toHaveBeenCalled();
      const data = prisma.listing.create.mock.calls[0][0].data;
      expect(data.address).toBe('Ташкент, Юнусабад, массив Файзли, 18');
    });

    it('update: новые координаты → ре-геокод с district_id из existing', async () => {
      prisma.listing.findFirst.mockResolvedValue({
        id: LISTING_ID,
        ownerId: OWNER_ID,
        originalLanguage: Language.RU,
        status: ListingStatus.ACTIVE,
        toursEnabled: false,
        tourWindows: [],
        price: new Prisma.Decimal('4500000.00'),
        currency: Currency.UZS,
        latitude: new Prisma.Decimal('41.2000'),
        longitude: new Prisma.Decimal('69.2000'),
        districtId: 'd-existing',
      });
      prisma.listing.update.mockResolvedValue(dbListing);
      addressResolver.resolve.mockResolvedValue({ address: 'Ташкент, ул. Новая, 1', addressEn: null });
      await service.update(OWNER_ID, LISTING_ID, {
        latitude: '41.311000',
        longitude: '69.280000',
      } as any);
      expect(addressResolver.resolve).toHaveBeenCalledWith('41.311000', '69.280000', 'd-existing');
      const data = prisma.listing.update.mock.calls[0][0].data;
      expect(data.address).toBe('Ташкент, ул. Новая, 1');
      expect(data.addressEn).toBeNull();
    });

    it('update: правка только текста адреса → нормализация БЕЗ ре-геокода', async () => {
      prisma.listing.findFirst.mockResolvedValue({
        id: LISTING_ID,
        ownerId: OWNER_ID,
        originalLanguage: Language.RU,
        status: ListingStatus.ACTIVE,
        toursEnabled: false,
        tourWindows: [],
        price: new Prisma.Decimal('4500000.00'),
        currency: Currency.UZS,
        latitude: new Prisma.Decimal('41.2000'),
        longitude: new Prisma.Decimal('69.2000'),
        districtId: 'd-existing',
      });
      prisma.listing.update.mockResolvedValue(dbListing);
      await service.update(OWNER_ID, LISTING_ID, {
        address: 'город Ташкент, свой дом у парка',
      } as any);
      expect(addressResolver.resolve).not.toHaveBeenCalled();
      const data = prisma.listing.update.mock.calls[0][0].data;
      expect(data.address).toBe('Ташкент, свой дом у парка');
      expect(data.addressEn).toBeNull();
    });
  });
```

- [ ] **Step 2: Тесты падают**

Run: `pnpm --filter @avino/api test -- listings.service.spec`
Expected: FAIL — конструктор не принимает 6-й аргумент / address не нормализован.

- [ ] **Step 3: Реализация в `listings.service.ts`**

1. Импорты: `import { DistrictsService } from '../geo';` → расширить до `import { AddressResolverService, DistrictsService, normalizeAddress } from '../geo';`
2. Конструктор — добавить параметр:
```ts
    private readonly addressResolver: AddressResolverService,
```
3. Приватный метод (рядом с `toScalarData`):
```ts
  /**
   * Адрес объявления (ADR-0147): координаты в dto → реверс-геокод ru+en
   * (AddressResolverService); геокодер молчит → строковая нормализация
   * присланного текста, addressEn сбрасывается (мог протухнуть против нового
   * ru). Правка только текста без координат ре-геокод НЕ вызывает — ручная
   * правка владельца уважается (но чистится нормализатором).
   */
  private async applyAddress(
    data: { address?: string | null; addressEn?: string | null },
    dto: {
      latitude?: string;
      longitude?: string;
      address?: string;
      district_id?: string;
    },
    existing?: { districtId: string | null } | null,
  ): Promise<void> {
    const coordsTouched =
      dto.latitude !== undefined && dto.longitude !== undefined;
    if (coordsTouched) {
      const districtId = dto.district_id ?? existing?.districtId ?? null;
      const resolved = await this.addressResolver.resolve(
        dto.latitude as string,
        dto.longitude as string,
        districtId,
      );
      if (resolved) {
        data.address = resolved.address;
        data.addressEn = resolved.addressEn;
        return;
      }
    }
    if (dto.address !== undefined) {
      data.address = normalizeAddress(dto.address);
      data.addressEn = null;
    }
  }
```
4. В `create()` после сборки `const data: Prisma.ListingUncheckedCreateInput = {...}` (перед `$transaction`):
```ts
    await this.applyAddress(data, dto);
```
5. В `update()`:
   - в `select` запроса `existing` (строка ~611) добавить `districtId: true,`;
   - после `const data: Prisma.ListingUpdateInput = this.toScalarData(dto);`:
```ts
    await this.applyAddress(
      data as { address?: string | null; addressEn?: string | null },
      dto,
      existing,
    );
```

Примечание: `update()` вызывает резолв только когда dto содержит ОБЕ координаты — клиентский визард шлёт их парой; частичная (одна) координата трактуется как «координаты не трогали».

- [ ] **Step 4: Все тесты зелёные**

Run: `pnpm --filter @avino/api test`
Expected: PASS (включая старые кейсы create/update: дефолтный стаб resolve→null + address undefined в базовых dto не меняет их поведение).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/listings/listings.service.ts apps/api/src/listings/listings.service.spec.ts
git commit -m "feat(api): normalize + geocode listing address on create/update (ADR-0147)"
```

---

### Task 5: env-прокладка + сиды

**Files:**
- Modify: `docker-compose.yml` (сервис `api`, блок `environment`)
- Modify: `apps/api/prisma/seed-all.cjs:514`

**Interfaces:** Consumes: `stripCityPrefix`-семантику повторяем в cjs инлайн (в сиде без импорта TS).

- [ ] **Step 1: docker-compose** — в `environment` сервиса `api` (рядом с другими ключами) добавить:
```yaml
      YANDEX_MAPS_API_KEY: ${YANDEX_MAPS_API_KEY:-}
```
Проверить: `rtk grep -n "YANDEX" docker-compose.yml docker-compose.staging.yml docker-compose.prod.yml` — если в staging/prod-оверлеях api-сервис имеет собственный environment-блок без наследования, добавить и туда.

- [ ] **Step 2: seed-all.cjs** — строка 514, было:
```js
  const address = `${region.nameRu}, ${district.nameRu}, ${street}, ${(g % 80) + 1}`;
```
стало (сид генерит уже канонический формат; `address_en` собираем из name_en района — улицы в сиде латиницей не дублируем, оставляем как есть):
```js
  const houseNo = (g % 80) + 1;
  // Канонический формат адреса (ADR-0147): без «город », регион = locality.
  const cityRu = region.nameRu.replace(/^(город|г\.)\s+/i, '');
  const address = `${cityRu}, ${district.nameRu}, ${street}, ${houseNo}`;
  const addressEn = `${region.nameEn.replace(/^Tashkent city$/i, 'Tashkent')}, ${district.nameEn}, ${street}, ${houseNo}`;
```
и в объект data сида добавить `addressEn,` рядом с `address,` (строка ~540). Перед правкой проверить реальные имена полей региона в сиде (`rtk grep -n "nameEn" apps/api/prisma/seed-all.cjs` — если у региона нет nameEn в структуре сида, `addressEn` собрать как `null`, это допустимый фолбэк).

- [ ] **Step 3: Прогнать сид на локальной БД (smoke)**

Run: `docker compose exec api node prisma/seed-all.cjs` (или локально `node apps/api/prisma/seed-all.cjs` с DATABASE_URL) — если локальный стек не поднят, шаг допустимо отметить как проверенный код-ревью (сид гоняется на staging).
Expected: адреса вида `Ташкент, Мирзо-Улугбек, ул. Бабура, 13`.

- [ ] **Step 4: Commit**

```bash
git add docker-compose.yml apps/api/prisma/seed-all.cjs
git commit -m "chore(api): pass YANDEX_MAPS_API_KEY to api; seed clean address format (ADR-0147)"
```

---

### Task 6: Backfill-скрипт

**Files:**
- Create: `apps/api/src/scripts/backfill-addresses.ts` (паттерн `src/scripts/export-openapi.ts` — компилится в dist)

**Interfaces:** Consumes: `AddressResolverService`, `normalizeAddress`, `AppModule` (Nest application context).

- [ ] **Step 1: Скрипт**

```ts
// apps/api/src/scripts/backfill-addresses.ts
import { NestFactory } from '@nestjs/core';
import { ListingStatus } from '@prisma/client';
import { AppModule } from '../app.module';
import { AddressResolverService, normalizeAddress } from '../geo';
import { PrismaService } from '../prisma';

/**
 * Backfill адресов существующих объявлений (ADR-0147, one-off ops).
 * С координатами → реверс-геокод ru+en; без координат → строковая нормализация.
 * Идемпотентен; пауза 300ms между геокодами (лимиты бесплатного тарифа).
 *
 * Запуск: node dist/scripts/backfill-addresses.js  (в контейнере api:
 * docker compose exec api node dist/scripts/backfill-addresses.js)
 */
async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['warn', 'error'],
  });
  const prisma = app.get(PrismaService);
  const resolver = app.get(AddressResolverService);

  const listings = await prisma.listing.findMany({
    where: { status: { not: ListingStatus.DELETED } },
    select: {
      id: true,
      address: true,
      latitude: true,
      longitude: true,
      districtId: true,
    },
    orderBy: { createdAt: 'asc' },
  });
  let geocoded = 0;
  let normalized = 0;
  let skipped = 0;

  for (const l of listings) {
    if (l.latitude != null && l.longitude != null) {
      const resolved = await resolver.resolve(
        l.latitude.toString(),
        l.longitude.toString(),
        l.districtId,
      );
      await new Promise((r) => setTimeout(r, 300));
      if (resolved) {
        await prisma.listing.update({
          where: { id: l.id },
          data: { address: resolved.address, addressEn: resolved.addressEn },
        });
        geocoded += 1;
        continue;
      }
    }
    if (l.address) {
      const clean = normalizeAddress(l.address);
      if (clean !== l.address) {
        await prisma.listing.update({
          where: { id: l.id },
          data: { address: clean, addressEn: null },
        });
        normalized += 1;
        continue;
      }
    }
    skipped += 1;
  }
  console.log(
    `backfill-addresses: total=${listings.length} geocoded=${geocoded} normalized=${normalized} skipped=${skipped}`,
  );
  await app.close();
}

void main();
```

Гоча: `prisma.update` бампает `@updatedAt`. Для ops-backfill это принято (адрес реально меняется); в ADR отметить.

- [ ] **Step 2: Билд**

Run: `pnpm --filter @avino/api build && ls apps/api/dist/scripts/backfill-addresses.js`
Expected: файл существует.

- [ ] **Step 3: Smoke на локальной БД (если стек поднят)**

Run: `cd apps/api && node dist/scripts/backfill-addresses.js`
Expected: строка-итог `backfill-addresses: total=… geocoded=… normalized=… skipped=…`; при пустом YANDEX_MAPS_API_KEY geocoded=0, normalized>0 на сидовых «город Ташкент…».

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/scripts/backfill-addresses.ts
git commit -m "feat(api): backfill script for listing addresses (ADR-0147)"
```

---

### Task 7: ADR + финализация PR-1

**Files:**
- Create: `docs/adr/ADR-0147-listing-address-normalization.md`
- Modify: `docs/ENV.md` (§ YANDEX_MAPS_API_KEY — уточнить, что ключ теперь реально используется api для HTTP Геокодера)

- [ ] **Step 1: ADR-0147** — краткий (по образцу соседних ADR): контекст (мусорный адрес из Suggest displayName / getAddressLine / сидов; одноязычность), решение (серверный HTTP Geocoder ru+en из структурных Components + район из districts; normalizeAddress-фолбэк; `listings.address_en`, НЕ listing_translations — title/source там NOT NULL и строки живут от модерации; uz → ru фолбэк), последствия (q ILIKE не меняется; backfill бампает updated_at; лимиты бесплатного тарифа).
- [ ] **Step 2: Полная проверка**

Run: `pnpm --filter @avino/api lint && pnpm --filter @avino/api test && pnpm --filter @avino/api build`
Expected: всё GREEN.

- [ ] **Step 3: Commit + PR**

```bash
git add docs/adr/ADR-0147-listing-address-normalization.md docs/ENV.md
git commit -m "docs: ADR-0147 listing address normalization"
git push -u origin feat/address-normalization
gh pr create --title "feat(api): listing address normalization + ru/en geocoding (ADR-0147)" --body "..."
```
PR-body: проблема (скрин Tommy), решение по спеке, чек-лист verify, `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

---

## PR-2 — ветка `feat/address-lang-serving` (base: `feat/address-normalization`)

### Task 8: Выдача address по языку — search list

**Files:**
- Modify: `apps/api/src/search/search.service.ts` (тип SearchRow ~103, select ~259, маппер ~1443)
- Test: `apps/api/src/search/search.service.int-spec.ts` (новый кейс) — CI гоняет int-spec ПО ОДНОМУ файлу (гео-контаминация, память проекта).

**Interfaces:** Consumes: `Listing.addressEn` (PR-1 Task 2); `language` уже резолвится в маппере (строка ~1405).

- [ ] **Step 1: Падающий int-spec кейс** — в `search.service.int-spec.ts` по образцу соседних кейсов (использовать хелпер создания листинга этого файла, добавив `addressEn`):

```ts
  it('address отдаётся по языку: en → address_en, uz → фолбэк ru (ADR-0147)', async () => {
    // создать листинг с address='Ташкент, Чиланзар, ул. Сеул, 7/1',
    // addressEn='Tashkent, Chilanzar, Seul koʻchasi, 7/1' (через хелпер файла)
    const ru = await service.searchListings({}, undefined, 'ru');
    const en = await service.searchListings({}, undefined, 'en');
    const uz = await service.searchListings({}, undefined, 'uz');
    expect(ru.data[0].address).toBe('Ташкент, Чиланзар, ул. Сеул, 7/1');
    expect(en.data[0].address).toBe('Tashkent, Chilanzar, Seul koʻchasi, 7/1');
    expect(uz.data[0].address).toBe('Ташкент, Чиланзар, ул. Сеул, 7/1');
  });
```
(Сигнатуру вызова сервиса взять из соседних кейсов файла — параметры langParam/acceptLanguage передаются так же, как в существующих тестах title-языка.)

- [ ] **Step 2: Кейс падает**

Run: `pnpm --filter @avino/api test:int -- search.service.int-spec`
Expected: FAIL (en-кейс получает ru-адрес).

- [ ] **Step 3: Реализация**
1. Тип SearchRow (строка ~103): после `address: string | null;` добавить `addressEn: string | null;`
2. Select (строка ~259): после `address: true,` добавить `addressEn: true,`
3. Маппер (строка ~1443):
```ts
      address:
        language === Language.EN
          ? (listing.addressEn ?? listing.address)
          : listing.address,
```
(`Language` уже импортирован в файле.)

- [ ] **Step 4: Кейс зелёный**

Run: `pnpm --filter @avino/api test:int -- search.service.int-spec`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/search/search.service.ts apps/api/src/search/search.service.int-spec.ts
git commit -m "feat(api): serve listing address by language in search (ADR-0147)"
```

---

### Task 9: Выдача address по языку — detail

**Files:**
- Modify: `apps/api/src/listings/listings.service.ts` (тип ListingDetailRow ~217, LISTING_DETAIL_SELECT ~283, toDetailResponse ~1166)
- Test: `apps/api/src/listings/listings.service.spec.ts`

**Interfaces:** Consumes: `language` уже приходит в `toDetailResponse(listing, language, districtName)`.

- [ ] **Step 1: Падающий тест** — в describe детали (`findOne`/`resolveDetail`) добавить кейс: замокать `prisma.listing.findUnique` строкой с `address: 'Ташкент, Чиланзар, ул. Сеул, 7/1'`, `addressEn: 'Tashkent, Chilanzar, Seul koʻchasi, 7/1'` и переводами RU+EN; вызвать `findOne(id, undefined, 'en')` → `expect(res.address).toBe('Tashkent, Chilanzar, Seul koʻchasi, 7/1')`; вызвать с `'uz'` (перевод UZ есть) → ru-адрес. Форму мока взять из существующих кейсов findOne этого файла, добавив `addressEn`.

- [ ] **Step 2: Тест падает**

Run: `pnpm --filter @avino/api test -- listings.service.spec`
Expected: FAIL.

- [ ] **Step 3: Реализация**
1. Тип `ListingDetailRow` (~217): после `address: string | null;` → `addressEn: string | null;`
2. `LISTING_DETAIL_SELECT` (~283): после `address: true,` → `addressEn: true,`
3. `toDetailResponse` (~1166):
```ts
      address:
        language === Language.EN
          ? (listing.addressEn ?? listing.address)
          : listing.address,
```

- [ ] **Step 4: Тесты зелёные**

Run: `pnpm --filter @avino/api test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/listings/listings.service.ts apps/api/src/listings/listings.service.spec.ts
git commit -m "feat(api): serve listing address by language in detail (ADR-0147)"
```

---

### Task 10: OpenAPI-дрифт + финализация PR-2

- [ ] **Step 1: OpenAPI** — контракт не меняется (address остаётся string), но CI проверяет дрифт:

Run: `pnpm --filter @avino/api openapi:export && rtk git status`
Expected: openapi.public.json / openapi.internal.json без изменений (если изменились — закоммитить).

- [ ] **Step 2: Полная проверка**

Run: `pnpm --filter @avino/api lint && pnpm --filter @avino/api test && pnpm --filter @avino/api build`
Expected: GREEN.

- [ ] **Step 3: Commit + PR**

```bash
git push -u origin feat/address-lang-serving
gh pr create --base feat/address-normalization --title "feat(api): serve listing address by request language (ADR-0147)" --body "..."
```
(Если PR-1 к этому моменту смёржен — base main.)

---

### Task 11: Live-verify (после мёржа обоих PR или на локальном стеке)

- [ ] Поднять локальный стек (`docker compose up -d`), убедиться что `YANDEX_MAPS_API_KEY` задан в `.env` (значение = NEXT_PUBLIC-ключ).
- [ ] Прогнать backfill: `docker compose exec api node dist/scripts/backfill-addresses.js` — вывод с geocoded>0.
- [ ] `curl "http://localhost:4000/api/v1/search/listings?limit=1" -H "Accept-Language: ru"` → address без «город», без хвоста-дубля.
- [ ] Тот же запрос с `Accept-Language: en` → address_en-значение; с `uz` → ru-значение.
- [ ] В браузере: /search на ru и en — карточки показывают короткий адрес, вёрстка в одну-две строки (скрин для Tommy).
- [ ] Создать объявление через визард (dev OTP из логов api) → в БД address канонический, address_en заполнен.
