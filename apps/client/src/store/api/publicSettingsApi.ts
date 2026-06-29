/**
 * publicSettingsApi — публичные фиче-флаги портала (CLAUDE.md §4).
 * GET /api/v1/settings/public → { promotionsEnabled, mapHoverRecenter,
 * legalConsentRequired, legalConsentVersion }. camelCase
 * (контроллер отдаёт PublicSettingsView как есть) — transformResponse НЕ нужен.
 * Зеркалит exchangeRateApi (но тот мапит snake_case, здесь не требуется).
 */
import { baseApi } from './baseApi';

export interface PublicSettings {
  promotionsEnabled: boolean;
  mapHoverRecenter: boolean;
  legalConsentRequired: boolean;
  legalConsentVersion: number;
}

export const publicSettingsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getPublicSettings: build.query<PublicSettings, void>({
      query: () => ({ url: '/settings/public' }),
    }),
  }),
  overrideExisting: false,
});

export const { useGetPublicSettingsQuery } = publicSettingsApi;
