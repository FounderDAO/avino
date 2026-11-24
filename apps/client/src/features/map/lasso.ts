/**
 * Рисование зоны от руки — как в мобильном приложении (map_search_screen.dart):
 * путь копится в экранных пикселях, после отпускания прореживается равномерным
 * шагом до ~32 вершин и только потом переводится в координаты.
 */

/** Сколько вершин оставляем у нарисованной зоны (как `targetVertices` в приложении). */
export const ZONE_TARGET_VERTICES = 32;

/** Не добавляем точку ближе этого (px) к предыдущей — меньше перерисовок. */
export const DRAW_MIN_STEP_PX = 2;

export type ScreenPoint = [number, number];

/** Равномерная выборка: каждая `ceil(n / target)`-я точка, как в приложении. */
export function decimatePath<T>(path: readonly T[], target = ZONE_TARGET_VERTICES): T[] {
  if (path.length === 0) return [];
  const step = Math.min(Math.max(Math.ceil(path.length / target), 1), path.length);
  const out: T[] = [];
  for (let i = 0; i < path.length; i += step) out.push(path[i]);
  return out;
}

/** Добавить точку, если она дальше {@link DRAW_MIN_STEP_PX} от последней. */
export function appendPoint(path: ScreenPoint[], p: ScreenPoint): ScreenPoint[] {
  const last = path[path.length - 1];
  if (last && Math.hypot(p[0] - last[0], p[1] - last[1]) < DRAW_MIN_STEP_PX) return path;
  return [...path, p];
}

/** SVG-путь линии; `closed` — замкнутый контур для заливки. */
export function svgPath(path: readonly ScreenPoint[], closed = false): string {
  if (path.length === 0) return '';
  const [first, ...rest] = path;
  return `M${first[0]},${first[1]}${rest.map(([x, y]) => `L${x},${y}`).join('')}${closed ? 'Z' : ''}`;
}
