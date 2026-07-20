import { Controller, Get } from '@nestjs/common';
import { AmenitiesService, AmenityResponse } from './amenities.service';

/**
 * AmenitiesController — публичный справочник удобств для форм и фильтров.
 * `GET /api/v1/amenities` — только активные (is_active=true), сортировка
 * sort_order. Admin CRUD — {@link AdminAmenitiesController}.
 */
@Controller({ path: 'amenities', version: '1' })
export class AmenitiesController {
  constructor(private readonly amenities: AmenitiesService) {}

  /** `GET /api/v1/amenities` → активные удобства. */
  @Get()
  list(): Promise<AmenityResponse[]> {
    return this.amenities.listActive();
  }
}
