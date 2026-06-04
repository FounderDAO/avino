import { IsInt, IsObject } from 'class-validator';

/**
 * Версионированный контейнер фильтров сохранённого поиска (TASK-091, API.md §12,
 * DB_SCHEMA.md §9): `{ "schemaVersion": <int>, "filters": { ... } }`.
 *
 * `schemaVersion` валидируется структурно как целое (отсутствие/не-число → `400
 * VALIDATION_ERROR`); поддержка конкретной версии проверяется в сервисе и при
 * неизвестной даёт `422 UNSUPPORTED_FILTER_SCHEMA`. `filters` — намеренно
 * свободный объект (не валидируется по DTO `/search`): матчер толерантен к
 * старым версиям, а набор параметров поиска эволюционирует (TASK-081/082) — жёсткая
 * привязка сломала бы forward-совместимость сохранённых поисков.
 */
export class FiltersJsonDto {
  @IsInt()
  schemaVersion!: number;

  @IsObject()
  filters!: Record<string, unknown>;
}
