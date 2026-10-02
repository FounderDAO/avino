import { adminApi } from './adminApi';
import type { ListingImportReport } from './adminTypes';

function formData(file: File): FormData {
  const body = new FormData();
  body.append('file', file);
  return body;
}

/**
 * adminListingImportsApi — массовый импорт объявлений (API.md §16, ADR-0162).
 *
 * - `POST /admin/listing-imports?dry_run=true` — предпросмотр, в БД ничего не
 *   пишется, кэш не инвалидируется.
 * - `POST /admin/listing-imports` — запуск; инвалидирует `Admin`, чтобы список
 *   объявлений перечитался.
 * - `GET /admin/listing-imports/template` — шаблон `.xlsx`. Ответ превращается в
 *   object URL прямо в `responseHandler`: Blob в redux-store класть нельзя
 *   (не сериализуется), строку — можно.
 *
 * Тело — `FormData`: `fetchBaseQuery` сам не ставит `Content-Type`, границу
 * multipart выставляет браузер.
 */
export const adminListingImportsApi = adminApi.injectEndpoints({
  endpoints: (build) => ({
    previewListingImport: build.mutation<ListingImportReport, File>({
      query: (file) => ({
        url: '/admin/listing-imports',
        method: 'POST',
        params: { dry_run: true },
        body: formData(file),
      }),
    }),
    runListingImport: build.mutation<ListingImportReport, File>({
      query: (file) => ({
        url: '/admin/listing-imports',
        method: 'POST',
        body: formData(file),
      }),
      invalidatesTags: ['Admin'],
    }),
    downloadListingImportTemplate: build.mutation<string, void>({
      query: () => ({
        url: '/admin/listing-imports/template',
        // Не-2xx: возвращённый JSON попадёт в `error.data` (validateStatus уже false).
        responseHandler: async (response) =>
          response.ok ? URL.createObjectURL(await response.blob()) : response.json(),
      }),
    }),
  }),
  overrideExisting: false,
});

export const {
  usePreviewListingImportMutation,
  useRunListingImportMutation,
  useDownloadListingImportTemplateMutation,
} = adminListingImportsApi;
