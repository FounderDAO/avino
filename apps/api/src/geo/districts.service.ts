import { Injectable } from '@nestjs/common';
import { Language } from '@prisma/client';
import { PrismaService } from '../prisma';

/** Строка справочника районов для публичного ответа (snake_case контракт §geo). */
export interface DistrictListItem {
  id: string;
  code: string;
  name_uz: string;
  name_ru: string;
  name_en: string;
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
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Полный список районов в алфавитном порядке (по name_ru) — ответ
   * `GET /api/v1/geo/districts` (API.md §geo, ADR-0068).
   */
  async listAll(): Promise<DistrictListItem[]> {
    const rows = await this.prisma.district.findMany({
      orderBy: { nameRu: 'asc' },
      select: { id: true, code: true, nameUz: true, nameRu: true, nameEn: true },
    });
    return rows.map((r) => ({
      id: r.id,
      code: r.code,
      name_uz: r.nameUz,
      name_ru: r.nameRu,
      name_en: r.nameEn,
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
}
