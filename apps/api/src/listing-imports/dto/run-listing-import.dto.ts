import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

/** Query `POST /api/v1/admin/listing-imports`. */
export class RunListingImportQueryDto {
  /** `true` — только предпросмотр: файл разбирается и проверяется, в БД ничего не пишется. */
  @IsOptional()
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean()
  dry_run?: boolean;
}
