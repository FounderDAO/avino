import { baseApi } from './baseApi';
import { toQueryParams, clampLimit, DEFAULT_LIMIT } from './pagination';
import type { Paginated } from './pagination';
import type {
  Currency,
  DealType,
  Language,
  PromotionType,
  PropertyType,
} from '@avino/shared';

/**
 * searchApi (TASK-151) — публичный поиск объявлений (docs/API.md §9).
 *
 * Инъекция в общий `baseApi` (CLAUDE.md §4: только RTK Query, без fetch/axios
 * в компонентах). `GET /api/v1/search` возвращает **только `ACTIVE`** и по
 * умолчанию упорядочивает `VIP > TOP > NORMAL → created_at DESC → id DESC`
 * (`sort=promotion_priority_desc`, ADR-006/007).
 *
 * Пагинация — keyset (`cursor` → `meta.next_cursor`). Эндпоинт настроен на
 * накопление страниц («показать ещё»): `serializeQueryArgs` исключает `cursor`,
 * поэтому смена фильтров создаёт новый кэш, а смена только `cursor` —
 * дозагружает в тот же список (`merge`).
 */

/** Значения параметра `sort` (docs/API.md §4). */
export type SearchSort =
  | 'promotion_priority_desc'
  | 'price_asc'
  | 'price_desc'
  | 'date_desc'
  | 'area_asc'
  | 'area_desc';

export const DEFAULT_SORT: SearchSort = 'promotion_priority_desc';

/** Фильтры поиска (docs/API.md §9). snake_case как в контракте API. */
export interface SearchFilters {
  q?: string;
  city_id?: string;
  district_id?: string;
  transaction_type?: DealType;
  property_type?: PropertyType;
  price_min?: number;
  price_max?: number;
  currency?: Currency;
  area_min?: number;
  area_max?: number;
  rooms?: number;
  promotion_type?: PromotionType;
  sort?: SearchSort;
}

/** Параметры запроса поиска: фильтры + keyset-пагинация. */
export interface SearchParams extends SearchFilters {
  cursor?: string;
  limit?: number;
}

/** Карточка листинга в выдаче поиска (docs/API.md §9, 200). */
export interface ListingCard {
  id: string;
  status: 'ACTIVE';
  transaction_type: DealType;
  property_type: PropertyType;
  price: string;
  currency: Currency;
  rooms: number | null;
  city_id: string | null;
  district_id: string | null;
  latitude: string | null;
  longitude: string | null;
  promotion_type: PromotionType;
  promotion_expires_at: string | null;
  /** Time-guarded тир (истёкшее промо трактуется как NORMAL). */
  effective_tier: PromotionType;
  language: Language;
  title: string;
  thumbnail_url: string | null;
  created_at: string;
}

export const searchApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    searchListings: build.query<Paginated<ListingCard>, SearchParams>({
      query: ({ limit, sort, ...filters }) => ({
        url: '/search',
        params: toQueryParams({
          ...filters,
          sort: sort ?? DEFAULT_SORT,
          limit: clampLimit(limit),
        }),
      }),
      // Кэш-ключ без `cursor` и `limit`: дозагрузка не плодит отдельные записи.
      serializeQueryArgs: ({ queryArgs, endpointName }) => {
        const { cursor: _cursor, limit: _limit, ...rest } = queryArgs;
        return { endpointName, ...rest };
      },
      // Первая страница (нет cursor) — заменяет; следующая — дозагружает.
      merge: (currentCache, response, { arg }) => {
        if (!arg.cursor) {
          currentCache.data = response.data;
        } else {
          currentCache.data.push(...response.data);
        }
        currentCache.meta = response.meta;
      },
      forceRefetch: ({ currentArg, previousArg }) =>
        currentArg?.cursor !== previousArg?.cursor,
      providesTags: ['Search'],
    }),
  }),
  overrideExisting: false,
});

export const { useSearchListingsQuery } = searchApi;

export const SEARCH_PAGE_SIZE = DEFAULT_LIMIT;
