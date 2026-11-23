import { Injectable } from '@nestjs/common';
import { GeoEntityType } from '@prisma/client';
import { PrismaService } from '../prisma';
import { groupAliases } from './geo-aliases';

/** Строка справочника регионов для публичного ответа (snake_case контракт §geo). */
export interface RegionListItem {
  id: string;
  code: string;
  name_uz: string;
  name_ru: string;
  name_en: string;
  /** Неизменяемый slug для адресов сайта (SEO AUD-15). */
  slug: string;
  /** Прежние slug'и — сайт отвечает 301 на текущий (SEO AUD-15). */
  aliases: string[];
}

/**
 * RegionsService — справочник регионов (ADR-0113). Зеркало DistrictsService.
 * Родитель района; lookup без relation на listings.
 */
@Injectable()
export class RegionsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Полный список регионов в порядке sort_order — `GET /api/v1/geo/regions`. */
  async listAll(): Promise<RegionListItem[]> {
    const [rows, aliases] = await Promise.all([
      this.prisma.region.findMany({
        orderBy: { sortOrder: 'asc' },
        select: { id: true, code: true, nameUz: true, nameRu: true, nameEn: true, slug: true },
      }),
      this.prisma.geoAlias.findMany({
        where: { entityType: GeoEntityType.REGION },
        select: { entityId: true, oldSlug: true },
      }),
    ]);
    const aliasesById = groupAliases(aliases);
    return rows.map((r) => ({
      id: r.id,
      code: r.code,
      name_uz: r.nameUz,
      name_ru: r.nameRu,
      name_en: r.nameEn,
      slug: r.slug,
      aliases: aliasesById.get(r.id) ?? [],
    }));
  }
}
