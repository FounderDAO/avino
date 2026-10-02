import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsOptional, IsUUID } from 'class-validator';
import { ListAdminListingsQueryDto } from './list-admin-listings.dto';

/** Потолок `ids` одной выгрузки: GET-запрос, длина URL ограничена. */
export const EXPORT_MAX_IDS = 100;

/** query-строка → массив id: `ids=a,b` либо повторяющийся параметр `ids=a&ids=b`. */
const toIdArray = ({ value }: { value: unknown }) => {
  if (value === undefined) return undefined;
  return (Array.isArray(value) ? value : [value]).flatMap((v) =>
    typeof v === 'string' ? v.split(',').filter(Boolean) : [v],
  );
};

/**
 * Query-параметры `GET /api/v1/admin/listings/export` (API.md §16, ADR-0164).
 *
 * Фильтры списка плюс `ids` — выгрузка отмеченных в таблице объявлений. `ids`
 * комбинируется с остальными фильтрами по AND, как любой другой фильтр.
 */
export class ExportAdminListingsQueryDto extends ListAdminListingsQueryDto {
  @IsOptional()
  @Transform(toIdArray)
  @IsArray()
  @ArrayMaxSize(EXPORT_MAX_IDS)
  @IsUUID('4', { each: true })
  ids?: string[];
}
