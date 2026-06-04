import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { FiltersJsonDto } from './filters-json.dto';

/**
 * Body `PATCH /api/v1/saved-searches/:id` (TASK-091, API.md §12).
 *
 * Частичное обновление: любое из `name` / `filters_json` / `is_active`. Все поля
 * опциональны; переданное `filters_json` валидируется так же, как при создании
 * (вложенно + проверка поддерживаемой `schemaVersion` в сервисе).
 */
export class UpdateSavedSearchDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  name?: string;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => FiltersJsonDto)
  filters_json?: FiltersJsonDto;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
