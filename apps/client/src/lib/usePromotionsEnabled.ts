/**
 * usePromotionsEnabled — флаг «продвижение включено» из публичных настроек.
 *
 * Читает GET /settings/public через RTK Query и возвращает булево значение.
 * Пока запрос грузится или завершился ошибкой — возвращает false,
 * чтобы кнопка «Продвинуть» была скрыта по умолчанию (fail-safe).
 *
 * Использование:
 *   const promotionsEnabled = usePromotionsEnabled();
 *   {promotionsEnabled && l.promo === 'NORMAL' && <Button>Продвинуть</Button>}
 */
import { useGetPublicSettingsQuery } from '@/store/api/publicSettingsApi';

export function usePromotionsEnabled(): boolean {
  const { data, isLoading, isError } = useGetPublicSettingsQuery();
  if (isLoading || isError || !data) return false;
  return data.promotionsEnabled;
}
