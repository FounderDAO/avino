/**
 * i18n админ-панели (ADMIN-17) — сборка словарей по локалям.
 *
 * Каждый раздел (`shared` + по странице) экспортирует `Record<Locale, Dict>` с
 * собственным namespace-ключом верхнего уровня (`login`, `listings`, …), которые
 * объединяются в один словарь на локаль. Ключи разделов не пересекаются.
 */

import type { Locale } from '../config';
import { shared } from './shared';
import { listings } from './listings';
import { complaints } from './complaints';
import { users } from './users';
import { logs } from './logs';
import { promotions } from './promotions';

export type Dict = { [key: string]: string | Dict };

const SECTIONS: Record<Locale, Dict>[] = [
  shared,
  listings,
  complaints,
  users,
  logs,
  promotions,
];

function merge(locale: Locale): Dict {
  return Object.assign({}, ...SECTIONS.map((section) => section[locale]));
}

export const messages: Record<Locale, Dict> = {
  ru: merge('ru'),
  uz: merge('uz'),
  en: merge('en'),
};
