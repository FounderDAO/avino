/**
 * Базовый URL публичного API (`…/api/v1`) для СЕРВЕРНОГО слоя (SSR).
 *
 * Почему отдельный резолвер, а не один `NEXT_PUBLIC_API_BASE_URL`:
 * `NEXT_PUBLIC_*` инлайнится в бандл на этапе сборки под БРАУЗЕР и указывает на
 * host-порт api (`http://localhost:4000`). Внутри Docker-контейнера `client`
 * адрес `localhost:4000` — это сам контейнер client, а не сервис `api`, поэтому
 * SSR-fetch падает с `ECONNREFUSED 127.0.0.1:4000`, а `safeSearch`/`getDistricts`
 * молча деградируют до пустого списка (пустые карусели и «Ничего не найдено»).
 *
 * Решение: server-only модули (`listings.ts`, `geo.ts`) берут рантайм-переменную
 * `API_INTERNAL_URL` (в docker-compose → `http://api:4000`, имя сервиса в сети
 * Docker). В host-dev и в браузере она не задана → используется публичный base.
 *
 * Резолвится ПРИ КАЖДОМ вызове (а не на импорте модуля), чтобы читать рантайм-env
 * у `next start`, а не значение момента сборки/первого импорта. Импорт этого
 * модуля побочных эффектов не имеет, поэтому он безопасен и в client-бандле
 * (там `process.env.API_INTERNAL_URL` === undefined → падение на NEXT_PUBLIC_*).
 */

/** Первое непустое значение env (пустую строку считаем «не задано»). */
function firstSet(...values: (string | undefined)[]): string | undefined {
  return values.find((v) => v != null && v !== '');
}

/** Корень API (`http(s)://host[:port]/api/v1`) с приоритетом серверной переменной. */
export function resolveApiBase(): string {
  const root =
    firstSet(
      process.env.API_INTERNAL_URL,
      process.env.NEXT_PUBLIC_API_BASE_URL,
    ) ?? 'http://localhost:4000';
  return `${root}/api/v1`;
}
