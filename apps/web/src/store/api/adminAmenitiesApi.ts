import { adminApi } from './adminApi';

/**
 * adminAmenitiesApi (ADR-0111) — справочник удобств объявлений (API.md §22).
 *
 * Инъекция в общий `adminApi` (CLAUDE.md §4: только RTK Query, без fetch/axios
 * в компонентах). Тег `Admin` — как у остальных admin-слайсов: мутации
 * create/update инвалидируют `Admin`, чтобы список перечитывался после действия.
 *
 * Регистр полей — snake_case (важно!): DTO бэкенда принимает `label_ru`/
 * `label_uz`/`label_en`/`code`/`sort_order`/`is_active` именно в snake_case
 * (это НЕ camelCase, как у adminBroadcastsApi). Ответы — тоже snake_case.
 *
 * Soft-delete-only: жёсткого DELETE нет, скрытие — `PATCH { is_active:false }`.
 * `code` неизменяем — `UpdateAmenityRequest` его не содержит.
 *
 * Эндпоинты:
 * - `GET  /admin/amenities` → `Amenity[]` (активные + скрытые, без пагинации).
 * - `POST /admin/amenities` → `Amenity` (создать).
 * - `PATCH /admin/amenities/:id` → `Amenity` (лейблы/порядок/видимость).
 */

/** Элемент справочника (snake_case, как отдаёт бэкенд). */
export interface Amenity {
  id: string;
  code: string;
  label_ru: string;
  label_uz: string;
  label_en: string;
  is_active: boolean;
  sort_order: number;
}

/**
 * Тело POST /admin/amenities (snake_case). Лейблы обязательны; `code`
 * опционален (пусто → автослаг из `label_en`); `sort_order`/`is_active`
 * опциональны (default 0 / true).
 */
export interface CreateAmenityRequest {
  label_ru: string;
  label_uz: string;
  label_en: string;
  code?: string;
  sort_order?: number;
  is_active?: boolean;
}

/**
 * Тело PATCH /admin/amenities/:id (snake_case). Все поля опциональны;
 * `code` неизменяем и в DTO не принимается. `id` — в URL, не в теле.
 */
export interface UpdateAmenityRequest {
  id: string;
  label_ru?: string;
  label_uz?: string;
  label_en?: string;
  sort_order?: number;
  is_active?: boolean;
}

export const adminAmenitiesApi = adminApi.injectEndpoints({
  endpoints: (build) => ({
    listAmenities: build.query<Amenity[], void>({
      query: () => ({ url: '/admin/amenities' }),
      providesTags: ['Admin'],
    }),

    createAmenity: build.mutation<Amenity, CreateAmenityRequest>({
      query: (body) => ({
        url: '/admin/amenities',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Admin'],
    }),

    updateAmenity: build.mutation<Amenity, UpdateAmenityRequest>({
      query: ({ id, ...body }) => ({
        url: `/admin/amenities/${id}`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['Admin'],
    }),
  }),
  overrideExisting: false,
});

export const {
  useListAmenitiesQuery,
  useCreateAmenityMutation,
  useUpdateAmenityMutation,
} = adminAmenitiesApi;
