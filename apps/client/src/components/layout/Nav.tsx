/**
 * NAV — описание пунктов главной навигации (общее для desktop/mobile).
 * Каждый пункт ведёт на App Router маршрут.
 */
export interface NavItem {
  key: string;
  label: string;
  href: string;
}

export const NAV_ITEMS: NavItem[] = [
  { key: 'sale', label: 'Купить', href: '/search?tx=SALE' },
  { key: 'rent', label: 'Аренда', href: '/search?tx=RENT' },
  { key: 'new', label: 'Новостройки', href: '/search?tx=SALE&type=NEW_BUILDING' },
  { key: 'sell', label: 'Продать', href: '/sell' },
  { key: 'help', label: 'Помощь', href: '/help' },
];
