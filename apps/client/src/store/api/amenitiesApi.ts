/**
 * amenitiesApi — RTK Query эндпоинт справочника удобств публичного портала
 * (CLAUDE.md §4, Task 5).
 *
 * `listAmenities` — активный справочник удобств для форм и фильтров:
 * GET /api/v1/amenities (только активные, отсортированы по sort_order).
 */
import { baseApi } from './baseApi';
import type { AmenityOption } from '@/lib/amenities';

export const amenitiesApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    listAmenities: build.query<AmenityOption[], void>({
      query: () => ({ url: '/amenities' }),
    }),
  }),
  overrideExisting: false,
});

export const { useListAmenitiesQuery } = amenitiesApi;
