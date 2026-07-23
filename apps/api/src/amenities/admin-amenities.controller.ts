import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { UserRole } from '@avino/shared';
import { Roles } from '../common/decorators';
import { JwtAuthGuard, RolesGuard } from '../common/guards';
import { AmenitiesService, AmenityResponse } from './amenities.service';
import { CreateAmenityDto } from './dto/create-amenity.dto';
import { UpdateAmenityDto } from './dto/update-amenity.dto';

/**
 * AdminAmenitiesController — управление справочником удобств (ADR-0111 → таблица).
 * Роуты `/api/v1/admin/amenities`. Регистрируется в {@link AdminModule}.
 * Soft-delete-only: скрытие через PATCH { is_active:false }, жёсткого DELETE нет.
 */
@Controller({ path: 'admin/amenities', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminAmenitiesController {
  constructor(private readonly amenities: AmenitiesService) {}

  /** `GET /api/v1/admin/amenities` — все удобства (активные + скрытые). */
  @Get()
  list(): Promise<AmenityResponse[]> {
    return this.amenities.listAll();
  }

  /** `POST /api/v1/admin/amenities` — создать удобство. Дубль code → 409. */
  @Post()
  create(@Body() dto: CreateAmenityDto): Promise<AmenityResponse> {
    return this.amenities.create(dto);
  }

  /** `PATCH /api/v1/admin/amenities/:id` — лейблы/порядок/видимость. */
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAmenityDto,
  ): Promise<AmenityResponse> {
    return this.amenities.update(id, dto);
  }
}
