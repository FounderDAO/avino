import { IsUUID } from 'class-validator';

/**
 * Body `POST /api/v1/favorites` (TASK-090, API.md §11).
 *
 * Идентификатор листинга передаётся в теле (snake_case контракт), а не в пути —
 * чтобы `POST /favorites` оставался коллекционным эндпоинтом, а удаление шло по
 * `DELETE /favorites/:listingId`.
 */
export class CreateFavoriteDto {
  @IsUUID()
  listing_id!: string;
}
