import { Controller, Get } from '@nestjs/common';
import { DistrictListItem, DistrictsService } from './districts.service';
import { RegionListItem, RegionsService } from './regions.service';

/**
 * GeoController — публичные гео-справочники (TASK-209, ADR-0068; ADR-0113 regions).
 *
 * Все маршруты публичные (без JwtAuthGuard) — клиент использует их для
 * dropdown'ов фильтрации и разрешения district_id в имена. Версия `1` прописана
 * явно согласно правилу §14 CLAUDE.md (unversioned routes запрещены).
 */
@Controller({ path: 'geo', version: '1' })
export class GeoController {
  constructor(
    private readonly districtsService: DistrictsService,
    private readonly regionsService: RegionsService,
  ) {}

  /**
   * `GET /api/v1/geo/districts` — полный список районов (ADR-0068, API.md §geo).
   * Auth: public. Ответ: `[{ id, code, name_uz, name_ru, name_en }]`.
   */
  @Get('districts')
  listDistricts(): Promise<DistrictListItem[]> {
    return this.districtsService.listAll();
  }

  /** `GET /api/v1/geo/regions` — полный список регионов (ADR-0113). Auth: public. */
  @Get('regions')
  listRegions(): Promise<RegionListItem[]> {
    return this.regionsService.listAll();
  }
}
