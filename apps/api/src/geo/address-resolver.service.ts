import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { distanceMeters, extractGeoObject, type GeoObjectParts } from './address-format';
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
    const apiKey = this.config.get<string>('maps.yandexApiKey');
    if (!apiKey) {
      return null;
    }
    const [ruOutcome, enOutcome] = await Promise.all([
      this.geocode(apiKey, lat, lng, 'ru_RU'),
      this.geocode(apiKey, lat, lng, 'en_US'),
    ]);
    const ru = ruOutcome.ok ? ruOutcome.parts : null;
    if (!ru) {
      return null;
    }
    const en = enOutcome.ok ? enOutcome.parts : null;

    const matched = await this.districts.matchByComponents(ru.components);
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
   * `null` — геокодер недоступен (нет ключа/сеть/ошибка); `{ districtId: null }` —
   * ответ есть, но район не распознан.
   */
  async resolveDistrictId(lat: string, lng: string): Promise<{ districtId: string | null } | null> {
    const apiKey = this.config.get<string>('maps.yandexApiKey');
    if (!apiKey) {
      return null;
    }
    const outcome = await this.geocode(apiKey, lat, lng, 'ru_RU');
    if (!outcome.ok) {
      return null;
    }
    if (!outcome.parts) {
      return { districtId: null };
    }
    const matched = await this.districts.matchByComponents(outcome.parts.components);
    return { districtId: matched?.id ?? null };
  }

  /** Один запрос к геокодеру; любая осечка → `{ ok: false }` (best-effort, warn в лог). */
  private async geocode(
    apiKey: string,
    lat: string,
    lng: string,
    lang: 'ru_RU' | 'en_US',
  ): Promise<GeocodeOutcome> {
    const params = new URLSearchParams({
      apikey: apiKey,
      geocode: `${lng},${lat}`, // longlat-порядок Яндекса
      sco: 'longlat',
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
        return { ok: false };
      }
      return { ok: true, parts: extractGeoObject(await res.json()) };
    } catch (e) {
      this.logger.warn(`Geocoder ${lang} failed: ${(e as Error).message}`);
      return { ok: false };
    }
  }
}
