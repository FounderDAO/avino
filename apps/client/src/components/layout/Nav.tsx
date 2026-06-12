/**
 * NAV — описание пунктов главной навигации (общее для desktop/mobile).
 * Каждый пункт ведёт на App Router маршрут.
 * `labelKey` — ключ перевода в неймспейсе `nav` (рендер: t(labelKey)).
 */
export interface NavItem {
  key: string;
  labelKey: string;
  href: string;
}

export const NAV_ITEMS: NavItem[] = [
  { key: 'sale', labelKey: 'buy', href: '/search?tx=SALE' },
  { key: 'rent', labelKey: 'rent', href: '/search?tx=RENT' },
  { key: 'new', labelKey: 'newBuildings', href: '/search?tx=SALE&type=NEW_BUILDING' },
  { key: 'map', labelKey: 'map', href: '/map' },
  { key: 'sell', labelKey: 'sell', href: '/sell' },
  { key: 'help', labelKey: 'help', href: '/help' },
];
