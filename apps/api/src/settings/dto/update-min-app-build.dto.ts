import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { MIN_APP_BUILD_MAX } from '../min-app-build.constants';

/**
 * Тело `PATCH /api/v1/admin/min-app-build`. Любое подмножество полей.
 * `0` = не требовать обновления.
 */
export class UpdateMinAppBuildDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MIN_APP_BUILD_MAX)
  ios?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MIN_APP_BUILD_MAX)
  android?: number;
}
