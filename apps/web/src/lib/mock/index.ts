/**
 * Мок-слой админки Avino — единственная точка доступа к данным для страниц.
 * Реэкспорт статичных данных + синхронные селекторы. Цикл 3 подменит на RTK Query.
 */
export * from './types';
export { LISTINGS, PROPERTY_TYPES, FALLBACK_PHOTO, formatPrice } from './listings';
export * as ADMIN from './admin';

import { listings, users, agents } from './admin';
import type { AdminListing, AdminUser } from './types';

/** Все админ-листинги. */
export function getAdminListings(): AdminListing[] {
  return listings;
}

/** Один админ-листинг по id. */
export function getAdminListingById(id: string): AdminListing | undefined {
  return listings.find((l) => l.id === id);
}

/** Один пользователь по id. */
export function getUserById(id: string): AdminUser | undefined {
  return users.find((u) => u.id === id);
}

/** Листинги пользователя по имени автора (для карточки UserDetail). */
export function getListingsByAgent(name: string): AdminListing[] {
  return listings.filter((l) => l.agent === name);
}

export { users, agents };
