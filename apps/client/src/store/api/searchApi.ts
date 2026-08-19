/**
 * searchApi — RTK Query слайс поиска публичного портала (CLAUDE.md §4).
 *
 * `searchByBounds` — поиск ACTIVE-листингов внутри видимой области карты:
 * GET /api/v1/search/bounds (API.md §10, PostGIS ST_MakeEnvelope/ST_Within).
 * `searchByPolygon` — поиск внутри нарисованной территории (freehand-ласо):
 * GET /api/v1/search/polygon (API.md §10, PostGIS ST_MakePolygon/ST_Within, TASK-193).
 * Используется новым поиском по карте (TASK-152, features/map):
 *  - при сдвиге/зуме карты (debounce) — подгружаем листинги текущего bbox;
 *  - при рисовании территории — отправляем кольцо обводки (`points`), точную
 *    фильтрацию ST_Within выполняет сервер (без client point-in-polygon).
 *
 * Ответ маппится в UI-модель {@link Listing} тем же {@link mapListing}, что и
 * серверный слой `lib/api/listings` (без дублирования; функция чистая, серверный
 * fetch-код tree-shake'ается из клиентского бандла).
 */
import { baseApi } from './baseApi';
import {
  mapListing,
  prioritizePhotos,
  boundsSearchPath,
  polygonSearchPath,
  searchPagePath,
  similarSearchPath,
  type SearchEnvelope,
  type SearchListingsPage,
} from '@/lib/api/listings';
import type {
  Listing,
  ListingFilter,
  PropertyType,
  TransactionType,
} from '@/lib/mock/types';
import type { LatLngBounds } from '@/lib/geo';

/** Аргументы поиска по области: углы bbox + опциональные фильтры §9. */
export interface BoundsSearchArgs {
  bounds: LatLngBounds;
  filter?: ListingFilter;
  /** Размер страницы (бэкенд: default 20 / max 100). Для карты берём максимум. */
  limit?: number;
}

/** Аргументы поиска по территории: сериализованное кольцо `points` + фильтры §9. */
export interface PolygonSearchArgs {
  /** Кольцо обводки `lat,lng;...` (см. lib/geo.serializePolygonRing). */
  points: string;
  filter?: ListingFilter;
  limit?: number;
}

/** Аргументы дозагрузки страницы выдачи (keyset, TASK-199). */
export interface SearchPageArgs {
  /** Курсор следующей страницы (meta.next_cursor предыдущей). */
  cursor: string;
  filter?: ListingFilter;
  /** Размер страницы — должен совпадать с SSR (24), чтобы keyset был непрерывным. */
  limit?: number;
}

/** Аргументы «Похожих» на карточке объекта: тот же tx/type, исключая текущий id. */
export interface SimilarListingsArgs {
  tx: TransactionType;
  type: PropertyType;
  excludeId: string;
  limit?: number;
}

export const searchApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    /** Листинги внутри видимой области карты (bbox), полный набор фильтров §9. */
    searchByBounds: build.query<Listing[], BoundsSearchArgs>({
      query: ({ bounds, filter = {}, limit = 100 }) =>
        boundsSearchPath(filter, bounds, limit),
      transformResponse: (env: SearchEnvelope) => env.data.map(mapListing),
      providesTags: ['Search'],
    }),

    /** Листинги внутри нарисованной территории (ST_Within, TASK-193). */
    searchByPolygon: build.query<Listing[], PolygonSearchArgs>({
      query: ({ points, filter = {}, limit = 100 }) =>
        polygonSearchPath(filter, points, limit),
      transformResponse: (env: SearchEnvelope) => env.data.map(mapListing),
      providesTags: ['Search'],
    }),

    /**
     * Дозагрузка следующей страницы выдачи /search по keyset-курсору (TASK-199).
     * Используется как lazy-query: SSR отдаёт первую страницу + next_cursor,
     * клиент дотягивает остальные по кнопке «Показать ещё». Сохраняет `meta`,
     * чтобы знать следующий курсор и общий total.
     */
    searchPage: build.query<SearchListingsPage, SearchPageArgs>({
      query: ({ cursor, filter = {}, limit = 24 }) =>
        searchPagePath(filter, limit, cursor),
      transformResponse: (env: SearchEnvelope) => ({
        listings: env.data.map(mapListing),
        total: env.meta.total,
        nextCursor: env.meta.next_cursor,
      }),
      providesTags: ['Search'],
    }),

    /**
     * «Похожие» на карточке объекта (Detail): тот же transaction_type/property_type,
     * исключая текущий листинг. КЛИЕНТСКИЙ query (а не серверный fetch из Detail),
     * потому что баз-квери подставляет Bearer зрителя автоматически (baseQuery.ts) —
     * серверный компонент этого сделать дёшево не может (access-токен только в
     * Redux-памяти клиента, ADR-0142/0153). Это даёт server-side блок-лист
     * (спека §2) на «Похожих» бесплатно + инвалидацию тегом 'Search' при
     * блокировке/разблокировке пользователя.
     */
    similarListings: build.query<Listing[], SimilarListingsArgs>({
      query: ({ tx, type, limit = 4 }) => similarSearchPath(tx, type, limit),
      transformResponse: (env: SearchEnvelope, _meta, arg: SimilarListingsArgs) => {
        const mapped = env.data
          .map(mapListing)
          .filter((l) => l.id !== arg.excludeId);
        return prioritizePhotos(mapped).slice(0, arg.limit ?? 4);
      },
      providesTags: ['Search'],
    }),
  }),
  overrideExisting: false,
});

export const {
  useSearchByBoundsQuery,
  useLazySearchByBoundsQuery,
  useSearchByPolygonQuery,
  useLazySearchByPolygonQuery,
  useLazySearchPageQuery,
  useSimilarListingsQuery,
} = searchApi;
