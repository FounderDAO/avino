import { IsBoolean } from 'class-validator';

/** Тело `PATCH /api/v1/admin/map-hover-recenter-flag`. */
export class UpdateMapHoverRecenterFlagDto {
  @IsBoolean()
  enabled!: boolean;
}
