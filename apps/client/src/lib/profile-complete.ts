import type { MeResponse } from '@/store/api/authApi';

/**
 * Полнота профиля для создания объявления (зеркало backend-гейта ADR-0125,
 * POST /listings → 422 PROFILE_INCOMPLETE): Имя и Фамилия непустые, телефон —
 * contact_phone профиля или телефон аккаунта (тот же фолбэк, что в публичном
 * контакт-блоке объявления).
 */
export function isProfileCompleteForListing(user: MeResponse | null): boolean {
  if (!user) return false;
  const firstName = user.profile?.first_name?.trim();
  const lastName = user.profile?.last_name?.trim();
  const phone = user.profile?.contact_phone?.trim() || user.phone?.trim();
  return Boolean(firstName && lastName && phone);
}
