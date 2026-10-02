import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

/** Query `POST /api/v1/admin/listing-imports`. */
export class RunListingImportQueryDto {
  /**
   * `true` — только предпросмотр: файл разбирается и проверяется, в БД ничего не пишется.
   * Читаем сырое значение из `obj`: глобальный ValidationPipe включает
   * `enableImplicitConversion`, и к моменту `@Transform` строка `'false'` в `value`
   * уже превращена в `true` через `Boolean('false')`.
   */
  @IsOptional()
  @Transform(({ obj }: { obj: Record<string, unknown> }) =>
    obj.dry_run === 'true' ? true : obj.dry_run === 'false' ? false : obj.dry_run,
  )
  @IsBoolean()
  dry_run?: boolean;
}
