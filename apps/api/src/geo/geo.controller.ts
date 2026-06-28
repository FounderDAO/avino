import { Controller, Get, Query } from '@nestjs/common';
import { ApiQuery } from '@nestjs/swagger';
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
   * `GET /api/v1/geo/districts?region_id=` — список районов, опц. фильтр по региону
   * (ADR-0068, API.md §geo, Task A4). Auth: public.
   * Ответ: `[{ id, code, name_uz, name_ru, name_en, region_id }]`.
   */
  @Get('districts')
  @ApiQuery({
    name: 'region_id',
    required: false,
    description: 'UUID региона для фильтрации; без параметра возвращаются все районы',
  })
  listDistricts(@Query('region_id') regionId?: string): Promise<DistrictListItem[]> {
    return this.districtsService.listAll(regionId);
  }

  /** `GET /api/v1/geo/regions` — полный список регионов (ADR-0113). Auth: public. */
  @Get('regions')
  listRegions(): Promise<RegionListItem[]> {
    return this.regionsService.listAll();
  }
}
