/**
 * useMapHoverRecenter — флаг «центрировать карту при наведении на карточку» из
 * публичных настроек (GET /settings/public). Пока грузится / при ошибке / если
 * поле отсутствует — возвращает false (fail-safe: карта стоит на месте,
 * Zillow-режим). Зеркалит usePromotionsEnabled.
 *
 * Использование:
 *   const recenter = useMapHoverRecenter();
 *   <MapView recenterOnHover={recenter} ... />
 */
import { useGetPublicSettingsQuery } from '@/store/api/publicSettingsApi';

export function useMapHoverRecenter(): boolean {
  const { data, isLoading, isError } = useGetPublicSettingsQuery();
  if (isLoading || isError || !data) return false;
  return data.mapHoverRecenter ?? false;
}
