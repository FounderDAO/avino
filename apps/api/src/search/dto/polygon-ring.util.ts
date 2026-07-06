import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

// ─── Polygon ring parse helper ─────────────────────────────────────────────────

/** Одна вершина кольца полигона (WGS84). */
export interface PolygonVertex {
  lat: number;
  lng: number;
}

/**
 * Единственный парсер строки `points` для полигонального поиска (TASK-193).
 *
 * Формат: `lat,lng;lat,lng;...` — вершины через `;`, каждая пара через `,`.
 * Возвращает массив вершин или выбрасывает `Error` с описанием проблемы.
 * Используется и валидатором `@IsPolygonRing()`, и `SearchService.polygonSql()` —
 * единственный источник истины, расхождение невозможно.
 *
 * Условия возврата ошибки:
 *   - менее 3 вершин;
 *   - нечисловые lat/lng;
 *   - lat ∉ [-90, 90];
 *   - lng ∉ [-180, 180].
 */
export function parsePolygonRing(raw: string): PolygonVertex[] {
  const pairs = raw
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (pairs.length < 3) {
    throw new Error(
      `points must contain at least 3 vertices (got ${pairs.length})`,
    );
  }
  return pairs.map((pair, i) => {
    const parts = pair.split(',');
    if (parts.length !== 2) {
      throw new Error(
        `vertex ${i}: expected "lat,lng" format, got "${pair}"`,
      );
    }
    const lat = Number(parts[0]);
    const lng = Number(parts[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw new Error(`vertex ${i}: non-numeric coordinates in "${pair}"`);
    }
    if (lat < -90 || lat > 90) {
      throw new Error(`vertex ${i}: lat ${lat} out of range [-90, 90]`);
    }
    if (lng < -180 || lng > 180) {
      throw new Error(`vertex ${i}: lng ${lng} out of range [-180, 180]`);
    }
    return { lat, lng };
  });
}

/**
 * Достаёт полигон из сохранённых фильтров (`filters_json.filters.points`).
 * Тройной исход:
 *   - `undefined` — ключа `points` нет/пустой/не строка → фильтр по территории не применяем;
 *   - `null` — `points` есть, но кольцо невалидно → вызывающий пропускает прогон
 *     (НЕ рассылаем алерты по всему городу);
 *   - `PolygonVertex[]` — валидное кольцо.
 * Тот же `parsePolygonRing`, что и у `/search/polygon` — расхождение невозможно.
 */
export function polygonVerticesFromFilters(
  filters: Record<string, unknown>,
): PolygonVertex[] | null | undefined {
  const raw = filters.points;
  if (typeof raw !== 'string' || raw.trim() === '') return undefined;
  try {
    return parsePolygonRing(raw);
  } catch {
    return null;
  }
}

// ─── @IsPolygonRing() / @IsPolygonRingOptional() decorators ───────────────────
//
// Живут здесь (не в geo-search.dto.ts), потому что `search-listings.dto.ts`
// (TASK-249) должен уметь импортировать декоратор для необязательного `points`
// без цикла: geo-search.dto.ts импортирует SearchListingsQueryDto ИЗ
// search-listings.dto.ts, поэтому декоратор не может жить в geo-search.dto.ts,
// если его хочет использовать и базовый DTO.

/**
 * Кастомный декоратор class-validator для ОБЯЗАТЕЛЬНОГО поля `points`
 * полигонального поиска (TASK-193, `/search/polygon`). Вызывает
 * {@link parsePolygonRing}; при ошибке — сообщение возвращается в 400
 * VALIDATION_ERROR. `undefined`/не-строка — невалидны (см.
 * {@link IsPolygonRingOptional} для необязательного варианта).
 */
export function IsPolygonRing(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isPolygonRing',
      target: (object as { constructor: new (...args: unknown[]) => unknown }).constructor,
      propertyName,
      options,
      validator: {
        validate(value: unknown): boolean {
          if (typeof value !== 'string') return false;
          try {
            parsePolygonRing(value);
            return true;
          } catch {
            return false;
          }
        },
        defaultMessage(args: ValidationArguments): string {
          const raw = args.value;
          if (typeof raw !== 'string') {
            return 'points must be a string';
          }
          try {
            parsePolygonRing(raw);
            return '';
          } catch (err) {
            return (err as Error).message;
          }
        },
      },
    });
  };
}

/**
 * Вариант {@link IsPolygonRing} для НЕОБЯЗАТЕЛЬНОГО `points` (TASK-249: `/search`,
 * `/search/bounds`) — `undefined` валиден (контур не задан → фильтр по территории
 * не применяется), заданное значение проверяется тем же {@link parsePolygonRing}.
 *
 * НЕ реализовано как `@IsOptional() @IsPolygonRing()` НАМЕРЕННО. class-validator
 * наследует validation-метаданные между базовым и производным классом ПО ИМЕНИ
 * СВОЙСТВА (`MetadataStorage.getTargetValidationMetadatas`): унаследованная
 * метаданная дедуплицируется против метаданных подкласса только если у подкласса
 * есть СВОЯ метаданная того же `type`. `PolygonSearchQueryDto.points` (TASK-193,
 * `/search/polygon`) — подкласс `SearchListingsQueryDto` и остаётся обязательным
 * (`points!: string`), но НЕ объявляет свой `@IsOptional()`/`@ValidateIf()`
 * (`type: 'conditionalValidation'`). Если бы базовый `points` был помечен
 * `@IsOptional()`, это условие унаследовалось бы в `PolygonSearchQueryDto` (нет
 * встречной `conditionalValidation`-метаданной для дедупа) и молча сделало бы
 * обязательный контур необязательным — `/search/polygon` перестал бы отдавать 400
 * при отсутствующем `points`. Этот декоратор — единственный custom-валидатор
 * (`type: 'customValidation'`) на `points` в базовом классе: подкласс полностью
 * переопределяет его своим собственным `@IsPolygonRing()` (дедуп по `type`,
 * см. выше), поэтому утечки в обратную сторону нет.
 */
export function IsPolygonRingOptional(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isPolygonRingOptional',
      target: (object as { constructor: new (...args: unknown[]) => unknown }).constructor,
      propertyName,
      options,
      validator: {
        validate(value: unknown): boolean {
          if (value === undefined) return true;
          if (typeof value !== 'string') return false;
          try {
            parsePolygonRing(value);
            return true;
          } catch {
            return false;
          }
        },
        defaultMessage(args: ValidationArguments): string {
          const raw = args.value;
          if (typeof raw !== 'string') {
            return 'points must be a string';
          }
          try {
            parsePolygonRing(raw);
            return '';
          } catch (err) {
            return (err as Error).message;
          }
        },
      },
    });
  };
}
