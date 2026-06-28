import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma';

/** Строка справочника регионов для публичного ответа (snake_case контракт §geo). */
export interface RegionListItem {
  id: string;
  code: string;
  name_uz: string;
  name_ru: string;
  name_en: string;
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
    const rows = await this.prisma.region.findMany({
      orderBy: { sortOrder: 'asc' },
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
}
