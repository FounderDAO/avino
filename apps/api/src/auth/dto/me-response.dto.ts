import { Language, UserStatus } from '@prisma/client';

/**
 * Профиль пользователя в ответе `GET /api/v1/auth/me` (TASK-045, API.md §3).
 *
 * Все поля профиля nullable (профиль создаётся лениво и может отсутствовать),
 * кроме `preferred_language`: он всегда конкретный язык — при отсутствии профиля
 * или незаданном значении подставляется `default_language` пользователя, чтобы
 * фронтовый тип `MeResponse['profile'].preferred_language` оставался non-null
 * (apps/web/src/store/api/authApi.ts).
 */
export interface MeProfile {
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  avatar_url: string | null;
  contact_phone: string | null;
  preferred_language: Language;
}

/**
 * Состояние согласия пользователя с юр-документами в ответе `GET /auth/me`.
 * `accepted_version` — версия последнего согласия (null, если ни разу). Клиент
 * сравнивает её с `legalConsentVersion` из GET /settings/public, чтобы решить,
 * показывать ли блокирующую модалку (design 2026-06-29).
 */
export interface MeLegalConsent {
  accepted_version: number | null;
  accepted_at: string | null;
}

/**
 * Ответ `GET /api/v1/auth/me` (TASK-045, API.md §3) — текущий пользователь +
 * профиль + роли. snake_case строго по контракту и фронтовому типу `MeResponse`.
 * `profile` присутствует всегда (даже без строки `user_profiles` — с null-полями).
 */
export interface MeResponse {
  id: string;
  phone: string | null;
  email: string | null;
  status: UserStatus;
  default_language: Language;
  is_phone_verified: boolean;
  is_email_verified: boolean;
  roles: string[];
  profile: MeProfile;
  legal_consent: MeLegalConsent;
}
