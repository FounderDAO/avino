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
