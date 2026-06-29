import { useGetMeQuery } from '@/store/api/authApi';
import { useGetPublicSettingsQuery } from '@/store/api/publicSettingsApi';
import { useAppSelector } from '@/store/hooks';
import { selectIsAuthenticated } from '@/store/slices/authSlice';

/**
 * Нужно ли показать блокирующую модалку согласия (design 2026-06-29 §5).
 * Fail-safe: пока настройки или `me` грузятся/в ошибке — возвращаем false,
 * чтобы не блокировать пользователя зря.
 */
export function useLegalConsentGate(): boolean {
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const settings = useGetPublicSettingsQuery();
  const me = useGetMeQuery(undefined, { skip: !isAuthenticated });

  if (!isAuthenticated) return false;
  if (settings.isLoading || settings.isError || !settings.data) return false;
  if (!settings.data.legalConsentRequired) return false;
  if (me.isLoading || me.isError || !me.data) return false;

  const accepted = me.data.legal_consent.accepted_version;
  return accepted == null || accepted < settings.data.legalConsentVersion;
}
