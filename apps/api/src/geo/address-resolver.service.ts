import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { distanceMeters, extractComponentLists, extractGeoObject, type GeoObjectParts } from './address-format';
import { mergeListingAddress } from './address-merge';
import { DistrictsService, type DistrictNames } from './districts.service';

/**
 * Результат резолва: ru-адрес (null — собрать нечего), en-версия (или null) и
 * район справочника, в который попадает точка (или null — не распознан).
 */
export interface ResolvedAddress {
  address: string | null;
  addressEn: string | null;
  districtId: string | null;
}

export interface ResolveAddressOptions {
  /** Район, выбранный пользователем, — для адреса, только если по точке район не распознан. */
  districtId?: string | null;
  /** Адрес, который ввёл/выбрал пользователь: не заменяется ближайшим домом геокодера. */
  userAddress?: string;
}

const GEOCODER_URL = 'https://geocode-maps.yandex.ru/1.x/';
const GEOCODER_TIMEOUT_MS = 3_000;
/**
 * Дом из ответа считается «домом у точки», только если его точка не дальше
 * этого расстояния. Дальше — это соседний/ближайший дом, номер не берём.
 */
const HOUSE_MAX_DISTANCE_M = 30;

/** Ответ одного запроса: `ok: false` — геокодер недоступен; `parts: null` — по точке ничего нет. */
type GeocodeOutcome = { ok: false } | { ok: true; parts: GeoObjectParts | null };

/**
 * AddressResolverService — адрес и район объявления по координатам через Yandex
 * HTTP Geocoder (ADR-0147, правка 2026-10-23).
 *
 * - Запрос БЕЗ `kind=house`: Яндекс отдаёт самый точный объект у точки (как
 *   JS-геокодер визарда), а не принудительно ближайший дом — для новостроек
 *   и частного сектора это был соседний дом.
 * - Район — по точке: компоненты ответа сопоставляются со справочником
 *   (DistrictsService.matchByComponents, правило как в визарде). Он же идёт в
 *   адрес и в `district_id` объявления, если тот не задан.
 * - Адрес пользователя не перезаписывается: геокодер только дополняет его и
 *   даёт en-версию (address-merge.ts).
 *
 * Best-effort: нет ключа / сеть / пустой ответ на ru → null, вызывающий
 * применяет строковый фолбэк normalizeAddress. Создание объявления никогда не
 * блокируется. uz не запрашивается — Яндекс его не поддерживает.
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
    options: ResolveAddressOptions = {},
  ): Promise<ResolvedAddress | null> {
    // Район по границе (SEO AUD-3) — точнее компонент геокодера и работает без него.
    const byPoint = await this.districtByPoint(lat, lng);
    // Граница у края города приблизительная: явный район другого региона в
    // адресе важнее (см. DistrictsService.reconcileWithAddress).
    const fromPoint: { id: string; names?: DistrictNames } | null = byPoint
      ? ((await this.districts.reconcileWithAddress(await this.withNames(byPoint), options.userAddress)) ?? {
          id: byPoint,
        })
      : null;
    const apiKey = this.config.get<string>('maps.yandexApiKey');
    const [ruOutcome, enOutcome] = apiKey
      ? await Promise.all([
          this.geocode(apiKey, lat, lng, 'ru_RU'),
          this.geocode(apiKey, lat, lng, 'en_US'),
        ])
      : [{ ok: false as const }, { ok: false as const }];
    const ru = ruOutcome.ok ? ruOutcome.parts : null;
    if (!ru) {
      // Геокодер молчит — район по границе или из самого адреса.
      const districtId =
        fromPoint?.id ?? (await this.districts.reconcileWithAddress(null, options.userAddress))?.id;
      return districtId ? { address: null, addressEn: null, districtId } : null;
    }
    const en = enOutcome.ok ? enOutcome.parts : null;

    const matched =
      fromPoint ??
      (await this.districts.reconcileWithAddress(
        (await this.districts.matchByComponents(ru.components)) ??
          (await this.districtByGeocoderKind(apiKey as string, lat, lng)),
        options.userAddress,
      ));
    let district: DistrictNames | undefined = matched?.names;
    if (!district && options.districtId) {
      district = (await this.districts.namesByIds([options.districtId])).get(options.districtId);
    }
    const query = { lat: Number(lat), lng: Number(lng) };
    const houseTrusted =
      ru.house !== null && ru.point !== null && distanceMeters(query, ru.point) <= HOUSE_MAX_DISTANCE_M;

    const merged = mergeListingAddress(options.userAddress, {
      ru,
      en,
      houseTrusted,
      district: district ?? null,
    });
    return { ...merged, districtId: matched?.id ?? null };
  }

  /**
   * Только район справочника по точке (один ru-запрос) — для импорта и backfill.
   * `addressText` — адрес объявления: явный район другого региона в нём важнее
   * геокодера (DistrictsService.reconcileWithAddress).
   * `null` — геокодер недоступен (нет ключа/сеть/ошибка); `{ districtId: null }` —
   * ответ есть, но район не распознан.
   */
  async resolveDistrictId(
    lat: string,
    lng: string,
    addressText?: string | null,
  ): Promise<{ districtId: string | null } | null> {
    // Сначала граница района (SEO AUD-3): без сети и квоты геокодера. Явный
    // район другого региона в адресе важнее — граница у края города неточная.
    const byPoint = await this.districtByPoint(lat, lng);
    if (byPoint) {
      const matched = await this.districts.reconcileWithAddress(await this.withNames(byPoint), addressText);
      return { districtId: matched?.id ?? byPoint };
    }
    // Явные регион и район в тексте адреса — без геокодера (квота, сбои).
    const fromText = await this.districts.reconcileWithAddress(null, addressText);
    const apiKey = this.config.get<string>('maps.yandexApiKey');
    if (!apiKey) {
      return fromText ? { districtId: fromText.id } : null;
    }
    const outcome = await this.geocode(apiKey, lat, lng, 'ru_RU');
    if (!outcome.ok) {
      return fromText ? { districtId: fromText.id } : null;
    }
    if (!outcome.parts) {
      return { districtId: fromText?.id ?? null };
    }
    const matched = await this.districts.reconcileWithAddress(
      (await this.districts.matchByComponents(outcome.parts.components)) ??
        (await this.districtByGeocoderKind(apiKey, lat, lng)),
      addressText,
    );
    return { districtId: matched?.id ?? null };
  }

  /**
   * Запасной путь: у адреса уровня дома Яндекс часто не отдаёт компоненту
   * района (`province, locality, street, house`). Запрос с `kind=district`
   * возвращает районы у точки; первым может прийти ЖК без района, поэтому
   * перебираем несколько объектов. Сбой — просто «не распознан».
   */
  private async districtByGeocoderKind(
    apiKey: string,
    lat: string,
    lng: string,
  ): Promise<{ id: string; names: DistrictNames } | null> {
    const json = await this.fetchGeocoder(apiKey, lat, lng, 'ru_RU', { kind: 'district', results: '5' });
    if (!json) return null;
    for (const components of extractComponentLists(json)) {
      const hit = await this.districts.matchByComponents(components);
      if (hit) return hit;
    }
    return null;
  }

  /** Район справочника с именами (для сверки с адресом). */
  private async withNames(districtId: string): Promise<{ id: string; names: DistrictNames } | null> {
    const names = (await this.districts.namesByIds([districtId])).get(districtId);
    return names ? { id: districtId, names } : null;
  }

  /** Район по границам; сбой БД не мешает запасному пути через геокодер. */
  private async districtByPoint(lat: string, lng: string): Promise<string | null> {
    try {
      return await this.districts.districtIdByPoint(lat, lng);
    } catch (e) {
      this.logger.warn(`District boundary lookup failed: ${(e as Error).message}`);
      return null;
    }
  }

  /** Один запрос к геокодеру; любая осечка → `{ ok: false }` (best-effort, warn в лог). */
  private async geocode(
    apiKey: string,
    lat: string,
    lng: string,
    lang: 'ru_RU' | 'en_US',
  ): Promise<GeocodeOutcome> {
    const json = await this.fetchGeocoder(apiKey, lat, lng, lang);
    return json === null ? { ok: false } : { ok: true, parts: extractGeoObject(json) };
  }

  /** Сырой ответ геокодера; любая осечка → null (warn в лог). */
  private async fetchGeocoder(
    apiKey: string,
    lat: string,
    lng: string,
    lang: 'ru_RU' | 'en_US',
    extra: Record<string, string> = {},
  ): Promise<unknown> {
    const params = new URLSearchParams({
      apikey: apiKey,
      geocode: `${lng},${lat}`, // longlat-порядок Яндекса
      sco: 'longlat',
      format: 'json',
      results: '1',
      lang,
      ...extra,
    });
    try {
      const res = await fetch(`${GEOCODER_URL}?${params}`, {
        signal: AbortSignal.timeout(GEOCODER_TIMEOUT_MS),
      });
      if (!res.ok) {
        this.logger.warn(`Geocoder ${lang} responded ${res.status}`);
        return null;
      }
      return (await res.json()) as unknown;
    } catch (e) {
      this.logger.warn(`Geocoder ${lang} failed: ${(e as Error).message}`);
      return null;
    }
  }
}
