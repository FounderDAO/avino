/**
 * Серверный слой справочника удобств (реальный NestJS API).
 *
 * Вызывается ТОЛЬКО из server components (Detail): чипы удобств должны попадать
 * в SSR-HTML — это контентный сигнал detail-страницы для поисковиков, и без
 * серверного рендера секция «Удобства» моргает пустой до гидратации.
 * Клиентские формы и фильтры берут тот же справочник через RTK Query
 * (`store/api/amenitiesApi.ts`).
 *
 * Эндпоинт (API.md §amenities, Task 5):
 *  - GET /api/v1/amenities — активный справочник (auth: public), только
 *    активные записи, отсортированы по sort_order.
 */
import type { AmenityOption } from '@/lib/amenities';
import { resolveApiBase } from './base';

/**
 * Активный справочник удобств для SSR-рендера чипов. Справочник редко меняется
 * → кэш на 1 час (`revalidate`), как у гео-справочников. При ошибке API
 * (5xx/4xx/сеть) деградирует до пустого списка вместо краха SSR — чипы просто
 * не рендерятся (логируется на сервере).
 */
export async function getAmenities(): Promise<AmenityOption[]> {
  try {
    const res = await fetch(`${resolveApiBase()}/amenities`, {
      next: { revalidate: 3600 },
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      throw new Error(`API ${res.status} ${res.statusText} for /amenities`);
    }
    return (await res.json()) as AmenityOption[];
  } catch (err) {
    console.error('[amenities] fetch failed, degrading to empty list', err);
    return [];
  }
}
