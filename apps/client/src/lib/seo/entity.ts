/**
 * Avino как организация — единственный источник для футера, JSON-LD и llms.txt.
 *
 * Правило: неподтверждённые факты не выдумываем и не рендерим. `verified: false`
 * — значение ждёт подтверждения владельца; такие ссылки не попадают в sameAs,
 * а `broken` (адрес не открывается) не показывается и в футере.
 */
import { routing } from '@/i18n/routing';
import { BASE } from './base';

export interface SocialProfile {
  /** Подпись в футере. */
  label: string;
  url: string;
  /**
   * true — адрес открывается (200) и это профиль Avino (проверено 2026-11-16).
   * Владение аккаунтом подтверждает владелец бизнеса.
   */
  verified: boolean;
  /** Адрес не открывается (404) — не показываем нигде. */
  broken?: boolean;
}

export interface ContactFact {
  /** null — значения нет; не выдумывать. */
  value: string | null;
  verified: boolean;
}

export const ENTITY = {
  name: 'Avino',
  url: BASE,
  /** Публичный файл app/apple-icon.png (180×180 — больше минимума Google 112×112). */
  logo: { url: `${BASE}/apple-icon.png`, width: 180, height: 180 },
  /** Картинка по умолчанию для og:image (public/og-default.png). */
  ogImage: { url: `${BASE}/og-default.png`, width: 1200, height: 630 },
  areaServed: 'Uzbekistan',
  availableLanguage: [...routing.locales],
  social: [
    { label: 'TG', url: 'https://t.me/avino_uz', verified: true },
    { label: 'IG', url: 'https://www.instagram.com/avino.uz', verified: true },
    // Facebook отдаёт стену логина — существование профиля не проверить.
    { label: 'FB', url: 'https://www.facebook.com/avino.uz', verified: false },
    // 404 на 2026-11-16.
    { label: 'YT', url: 'https://www.youtube.com/@avino_uz', verified: false, broken: true },
  ] satisfies SocialProfile[],
  // TODO(owner): контакты для разметки и llms.txt — только подтверждённые владельцем.
  telephone: { value: null, verified: false } satisfies ContactFact,
  email: { value: null, verified: false } satisfies ContactFact,
} as const;

/** sameAs для JSON-LD: только проверенные профили. */
export function verifiedSameAs(social: readonly SocialProfile[] = ENTITY.social): string[] {
  return social.filter((s) => s.verified && !s.broken).map((s) => s.url);
}

/** Ссылки футера: всё, кроме заведомо битых. */
export function footerSocial(social: readonly SocialProfile[] = ENTITY.social): SocialProfile[] {
  return social.filter((s) => !s.broken);
}

/** Подтверждённый контакт или undefined (неподтверждённое не рендерим). */
export function verifiedContact(fact: ContactFact): string | undefined {
  return fact.verified && fact.value ? fact.value : undefined;
}
