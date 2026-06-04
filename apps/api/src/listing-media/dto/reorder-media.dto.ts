import { ArrayNotEmpty, IsArray, IsUUID } from 'class-validator';

/**
 * Body `PATCH /api/v1/listings/:id/media/reorder` (TASK-061, API.md §8).
 *
 * `order` — полная перестановка id медиа листинга: каждый существующий media id
 * указан ровно один раз, в желаемом порядке показа. Позиция в массиве становится
 * `sort_order` (0-based). Сервис дополнительно проверяет, что набор id совпадает
 * с фактическими медиа листинга (без пропусков/дублей/чужих id).
 */
export class ReorderMediaDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  order!: string[];
}
