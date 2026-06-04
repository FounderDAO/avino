import { Type } from 'class-transformer';
import {
  IsObject,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { FiltersJsonDto } from './filters-json.dto';

/**
 * Body `POST /api/v1/saved-searches` (TASK-091, API.md §12).
 *
 * `name` ограничен 150 символами под `saved_searches.name VARCHAR(150)`
 * (DB_SCHEMA.md §9). `filters_json` валидируется вложенно ({@link FiltersJsonDto});
 * глобальный ValidationPipe (`whitelist`/`forbidNonWhitelisted`) режет лишние
 * поля на уровне конверта, но НЕ трогает содержимое свободного `filters`.
 */
export class CreateSavedSearchDto {
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  name!: string;

  @IsObject()
  @ValidateNested()
  @Type(() => FiltersJsonDto)
  filters_json!: FiltersJsonDto;
}
