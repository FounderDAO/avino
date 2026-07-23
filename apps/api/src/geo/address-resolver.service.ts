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
