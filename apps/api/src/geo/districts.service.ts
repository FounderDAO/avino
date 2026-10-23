import { Injectable } from '@nestjs/common';
import { Language } from '@prisma/client';
import { PrismaService } from '../prisma';
import {
  matchRegionDistrict,
  type DirectoryDistrict,
  type DirectoryRegion,
  type GeoComponent,
} from './geo-match';

/** Справочник для сопоставления по точке: меняется только миграциями — кешируем. */
const DIRECTORY_TTL_MS = 10 * 60_000;

interface GeoDirectory {
  regions: DirectoryRegion[];
  districts: Array<DirectoryDistrict & { names3: DistrictNames }>;
}

/** Строка справочника районов для публичного ответа (snake_case контракт §geo). */
export interface DistrictListItem {
  id: string;
  code: string;
  name_uz: string;
  name_ru: string;
  name_en: string;
  /** UUID родительского региона. null только если district создан без regionId (legacy). */
  region_id: string | null;
}

/** Trilingual запись района для разрешения имён (внутренний тип). */
export interface DistrictNames {
  nameUz: string;
  nameRu: string;
  nameEn: string;
}

/**
 * DistrictsService — справочник районов (TASK-209, ADR-0068).
 *
 * Предоставляет:
 * - {@link listAll} — полный список для публичного GET /api/v1/geo/districts;
 * - {@link namesByIds} — batch-lookup по district_id (для search/detail);
 * - {@link pickName} — выбор нужного языка из записи.
 *
 * Не имеет отношений с `listings` (ADR-0068 §2): lookup выполняется по скалярному
 * `district_id`, несовпадающий id даёт `undefined → null` (неломающий graceful degradation).
 */
@Injectable()
export class DistrictsService {
  private directoryCache: { at: number; value: Promise<GeoDirectory> } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Список районов в алфавитном порядке (по name_ru) — ответ
   * `GET /api/v1/geo/districts[?region_id=]` (API.md §geo, ADR-0068, Task A4).
   *
   * @param regionId — опциональный UUID региона; если передан — возвращает только
   *   районы этого региона. Без параметра возвращает весь список (обратная совместимость).
   */
  async listAll(regionId?: string): Promise<DistrictListItem[]> {
    const rows = await this.prisma.district.findMany({
      where: regionId ? { regionId } : undefined,
      orderBy: { nameRu: 'asc' },
      select: { id: true, code: true, nameUz: true, nameRu: true, nameEn: true, regionId: true },
    });
    return rows.map((r) => ({
      id: r.id,
      code: r.code,
      name_uz: r.nameUz,
      name_ru: r.nameRu,
      name_en: r.nameEn,
      region_id: r.regionId,
    }));
  }

  /**
   * Batch-lookup имён районов по набору id (дедуплицированный, без falsy значений).
   * Используется поиском и деталью листинга для разрешения `district_id → name`.
   * Несовпадающий id → отсутствует в Map → caller получает `undefined → null`.
   */
  async namesByIds(ids: string[]): Promise<Map<string, DistrictNames>> {
    // Дедуплицируем и убираем пустые значения перед запросом.
    const uniqueIds = [...new Set(ids.filter(Boolean))];
    if (uniqueIds.length === 0) {
      return new Map();
    }
    const rows = await this.prisma.district.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true, nameUz: true, nameRu: true, nameEn: true },
    });
    return new Map(
      rows.map((r) => [
        r.id,
        { nameUz: r.nameUz, nameRu: r.nameRu, nameEn: r.nameEn },
      ]),
    );
  }

  /**
   * Выбрать нужный языковой столбец из записи района.
   * `UZ → nameUz`, `EN → nameEn`, остальные (RU + fallback) → `nameRu`.
   * `undefined` (район не найден) → `null` (non-breaking, ADR-0068 §2).
   */
  pickName(
    district: DistrictNames | undefined,
    lang: Language,
  ): string | null {
    if (!district) {
      return null;
    }
    switch (lang) {
      case Language.UZ:
        return district.nameUz;
      case Language.EN:
        return district.nameEn;
      default:
        return district.nameRu;
    }
  }

  /**
   * Район справочника по компонентам адреса Yandex для точки (правило — как в
   * визарде, см. geo-match.ts). Не распознан → null.
   */
  async matchByComponents(
    components: GeoComponent[],
  ): Promise<{ id: string; names: DistrictNames } | null> {
    const directory = await this.directory();
    const { districtId } = matchRegionDistrict(components, directory.regions, directory.districts);
    const hit = districtId ? directory.districts.find((d) => d.id === districtId) : undefined;
    return hit ? { id: hit.id, names: hit.names3 } : null;
  }

  /** Регионы + районы для сопоставления; кеш на {@link DIRECTORY_TTL_MS}, сбой чтения не кешируется. */
  private directory(): Promise<GeoDirectory> {
    const now = Date.now();
    if (this.directoryCache && now - this.directoryCache.at < DIRECTORY_TTL_MS) {
      return this.directoryCache.value;
    }
    const value = this.loadDirectory();
    this.directoryCache = { at: now, value };
    value.catch(() => {
      if (this.directoryCache?.value === value) this.directoryCache = null;
    });
    return value;
  }

  private async loadDirectory(): Promise<GeoDirectory> {
    const [regions, districts] = await Promise.all([
      this.prisma.region.findMany({
        select: { id: true, code: true, nameUz: true, nameRu: true, nameEn: true },
      }),
      this.prisma.district.findMany({
        select: { id: true, nameUz: true, nameRu: true, nameEn: true, regionId: true },
      }),
    ]);
    return {
      regions: regions.map((r) => ({ id: r.id, code: r.code, names: [r.nameUz, r.nameRu, r.nameEn] })),
      districts: districts.map((d) => ({
        id: d.id,
        regionId: d.regionId,
        names: [d.nameUz, d.nameRu, d.nameEn],
        names3: { nameUz: d.nameUz, nameRu: d.nameRu, nameEn: d.nameEn },
      })),
    };
  }
}
