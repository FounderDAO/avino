import { adminApi } from './adminApi';
import { toQueryParams } from './pagination';
import type { Paginated } from './pagination';
import type {
  LegalConsent,
  LegalConsentFilters,
  LegalConsentVersionSummary,
} from './adminTypes';

/**
 * adminLegalConsentsApi — read-only журнал согласий с юр-документами
 * (Правила/Политика). Инъекция в общий `adminApi` (только RTK Query). Оба
 * эндпоинта — чистое чтение, тег `Admin` (инвалидируется при любой мутации
 * админки — для журнала это ожидаемо). Доступ на бэкенде ограничен ADMIN.
 *
 * - `GET /admin/legal-consents?search&version&from&to&page&limit`
 *   → `Paginated<LegalConsent>` (история согласий).
 * - `GET /admin/legal-consents/versions` → `LegalConsentVersionSummary[]`
 *   (версии + даты введения + счётчики; для фильтра и справочной панели).
 */
export const adminLegalConsentsApi = adminApi.injectEndpoints({
  endpoints: (build) => ({
    listLegalConsents: build.query<Paginated<LegalConsent>, LegalConsentFilters>(
      {
        query: (filters) => ({
          url: '/admin/legal-consents',
          params: toQueryParams({ ...filters }),
        }),
        providesTags: ['Admin'],
      },
    ),

    legalConsentVersions: build.query<LegalConsentVersionSummary[], void>({
      query: () => ({ url: '/admin/legal-consents/versions' }),
      providesTags: ['Admin'],
    }),
  }),
  overrideExisting: false,
});

export const { useListLegalConsentsQuery, useLegalConsentVersionsQuery } =
  adminLegalConsentsApi;
