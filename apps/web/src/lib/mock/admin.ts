/**
 * Мок-данные бэк-офиса Avino (порт apps/claudeDesign/scripts/admin-data.js).
 * Деривация админ-листингов из исходных + статичные пользователи, агенты, KPI,
 * данные графиков, логи, тарифы продвижения.
 */
import { LISTINGS, PROPERTY_TYPES, formatPrice } from './listings';
import type {
  ActivityItem,
  AdminAgent,
  AdminListing,
  AdminListingStatus,
  AdminUser,
  Kpi,
  Logs,
  ModerationItem,
  PromoHistoryItem,
  PromoPricing,
  Role,
  StatusMap,
} from './types';

const STAT: AdminListingStatus[] = ['ACTIVE', 'PENDING', 'ACTIVE', 'DRAFT', 'ACTIVE', 'REJECTED', 'PENDING', 'ACTIVE', 'ACTIVE', 'ARCHIVED', 'PENDING', 'ACTIVE'];
const VIEWS = [342, 0, 1280, 0, 540, 12, 0, 880, 1620, 210, 0, 95];
const DATES = ['07.06.2026', '09.06.2026', '01.06.2026', '08.06.2026', '29.05.2026', '06.06.2026', '09.06.2026', '02.06.2026', '21.05.2026', '10.04.2026', '09.06.2026', '04.06.2026'];

export const listings: AdminListing[] = LISTINGS.map((l, i) => ({
  id: l.id,
  title: l.title,
  photo: l.photos[0].thumb,
  price: formatPrice(l, { suffix: false }),
  priceRaw: l,
  type: PROPERTY_TYPES[l.type],
  rooms: l.rooms ?? '—',
  district: l.district.replace(/ский$/, '.'),
  agent: l.agent.name,
  status: STAT[i],
  views: VIEWS[i],
  created: DATES[i],
  promo: l.promo,
  tx: l.tx === 'RENT' ? 'Аренда' : 'Продажа',
}));

const REASON_OPTIONS = ['Некорректные фото', 'Подозрение на дубликат', 'Неверная цена', 'Запрещённый контент', 'Неполное описание'];

export const moderation: ModerationItem[] = listings
  .filter((l) => l.status === 'PENDING')
  .map((l) => {
    const src = LISTINGS.find((x) => x.id === l.id)!;
    return { ...l, full: src, reasonOptions: REASON_OPTIONS };
  });

export const users: AdminUser[] = [
  { id: 'u1', name: 'Алишер Авинов', phone: '+998 90 123 45 67', email: 'alisher@avino.uz', role: 'Owner', listings: 4, status: 'active', joined: '12.03.2025', verified: true },
  { id: 'u2', name: 'Дилноза Каримова', phone: '+998 91 234 56 78', email: 'dilnoza.k@estate.uz', role: 'Agent', listings: 27, status: 'active', joined: '04.11.2024', verified: true },
  { id: 'u3', name: 'Рустам Ахмедов', phone: '+998 93 345 67 89', email: 'rustam.a@mail.uz', role: 'Owner', listings: 1, status: 'active', joined: '28.05.2026', verified: false },
  { id: 'u4', name: 'Малика Юсупова', phone: '+998 94 456 78 90', email: 'malika@rentservice.uz', role: 'Agent', listings: 18, status: 'active', joined: '19.01.2025', verified: true },
  { id: 'u5', name: 'Bektemir Tursunov', phone: '+998 97 567 89 01', email: 'bektemir@mail.uz', role: 'User', listings: 0, status: 'blocked', joined: '02.06.2026', verified: false },
  { id: 'u6', name: 'Озода Рахимова', phone: '+998 90 678 90 12', email: 'ozoda.r@mail.uz', role: 'Landlord', listings: 3, status: 'active', joined: '15.02.2026', verified: true },
];

export const agents: AdminAgent[] = [
  { id: 'a1', name: 'Дилноза Каримова', agency: 'Estate Group', listings: 27, deals: 14, rating: 4.9, plan: 'VIP' },
  { id: 'a2', name: 'Малика Юсупова', agency: 'Rent Service', listings: 18, deals: 9, rating: 4.7, plan: 'Pro' },
  { id: 'a3', name: 'Жасур Тошпулатов', agency: 'City Homes', listings: 22, deals: 11, rating: 4.8, plan: 'Pro' },
  { id: 'a4', name: 'Boulevard Development', agency: 'Застройщик', listings: 41, deals: 33, rating: 5.0, plan: 'VIP' },
];

export const kpis: Kpi[] = [
  { label: 'Всего объявлений', value: '12 480', delta: '+6.2%', up: true },
  { label: 'Активных пользователей', value: '38 920', delta: '+12%', up: true },
  { label: 'На модерации', value: '3', delta: '+3 сегодня', up: false, accent: 'warn' },
  { label: 'Доход за месяц', value: '$24 800', delta: '+8.4%', up: true },
];

export const activity: ActivityItem[] = [
  { who: 'Дилноза К.', act: 'опубликовала объявление', what: '3-комн, Юнусабад', time: '5 мин назад' },
  { who: 'Модератор', act: 'одобрил', what: '2-комн, Чиланзар', time: '22 мин назад' },
  { who: 'Boulevard Dev.', act: 'оплатил VIP', what: 'Nest One, $120', time: '1 ч назад' },
  { who: 'Система', act: 'отклонила', what: 'дубликат объявления', time: '2 ч назад' },
  { who: 'Малика Ю.', act: 'ответила в чате', what: 'лид по аренде', time: '3 ч назад' },
];

// charts
export const listingsOverTime = [620, 740, 690, 880, 950, 1120, 1080, 1240, 1390, 1310, 1480, 1620];
export const months = ['Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек', 'Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн'];
export const byDistrict: [string, number][] = [
  ['Чиланзар', 2100], ['Юнусабад', 1840], ['М.-Улугбек', 1620], ['Сергели', 1280], ['Яккасарай', 940], ['Мирабад', 760],
];
export const buyRent = { buy: 64, rent: 36 };

export const STATUS_MAP: StatusMap = {
  ACTIVE: ['Опубликовано', 'var(--green)', 'var(--green-bg)'],
  PENDING: ['На проверке', 'var(--warn)', 'var(--warn-bg)'],
  REJECTED: ['Отклонено', 'var(--red)', 'var(--red-bg)'],
  DRAFT: ['Черновик', 'var(--teal)', 'var(--mint)'],
  ARCHIVED: ['В архиве', 'var(--muted)', 'var(--archive-bg)'],
};

export const logs: Logs = {
  audit: [
    { id: 'l1', action: 'LOGIN', entity: 'user', entityId: '9fe1617a-21c4', actor: '9fe1617a-21c4', ip: '::1', when: '09.06.2026, 17:25' },
    { id: 'l2', action: 'ROLE_CHANGE', entity: 'user', entityId: 'u2-8841ac', actor: 'admin-001', ip: '188.93.21.4', when: '09.06.2026, 16:58' },
    { id: 'l3', action: 'LISTING_STATUS_CHANGE', entity: 'listing', entityId: 'av-1001', actor: 'mod-014', ip: '188.93.21.4', when: '09.06.2026, 16:40' },
    { id: 'l4', action: 'USER_CREATE', entity: 'user', entityId: 'u178102-aa', actor: 'admin-001', ip: '188.93.21.4', when: '09.06.2026, 15:12' },
    { id: 'l5', action: 'PROMO_PURCHASE', entity: 'listing', entityId: 'av-1002', actor: 'u2-8841ac', ip: '84.54.78.9', when: '09.06.2026, 12:30' },
    { id: 'l6', action: 'USER_BLOCK', entity: 'user', entityId: 'u5-39bc01', actor: 'admin-001', ip: '188.93.21.4', when: '08.06.2026, 19:04' },
    { id: 'l7', action: 'PRICE_UPDATE', entity: 'promo_pricing', entityId: 'VIP-30', actor: 'admin-001', ip: '188.93.21.4', when: '08.06.2026, 11:20' },
    { id: 'l8', action: 'LISTING_CREATE', entity: 'listing', entityId: 'av-1011', actor: 'u4-7c1290', ip: '213.230.74.2', when: '08.06.2026, 09:47' },
    { id: 'l9', action: 'LOGOUT', entity: 'user', entityId: '9fe1617a-21c4', actor: '9fe1617a-21c4', ip: '::1', when: '07.06.2026, 22:15' },
  ],
  moderation: [
    { id: 'ml1', action: 'APPROVE', listing: 'Просторная 3-комнатная у метро', moderator: 'mod-014', reason: '—', when: '09.06.2026, 16:40' },
    { id: 'ml2', action: 'REJECT', listing: 'Студия в центре', moderator: 'mod-014', reason: 'Подозрение на дубликат', when: '09.06.2026, 14:02' },
    { id: 'ml3', action: 'APPROVE', listing: '2-комнатная в новостройке', moderator: 'mod-007', reason: '—', when: '09.06.2026, 11:28' },
    { id: 'ml4', action: 'REJECT', listing: 'Дом без фото', moderator: 'mod-007', reason: 'Некорректные фото', when: '08.06.2026, 18:50' },
    { id: 'ml5', action: 'APPROVE', listing: 'Видовая 3-комнатная в Tashkent City', moderator: 'mod-014', reason: '—', when: '08.06.2026, 10:11' },
    { id: 'ml6', action: 'REJECT', listing: 'Коммерция, первая линия', moderator: 'mod-007', reason: 'Неверная цена', when: '07.06.2026, 16:33' },
  ],
  promo: [
    { id: 'pl1', listing: 'Просторная 3-комнатная у метро', buyer: 'Дилноза Каримова', type: 'VIP', days: 30, amount: 350000, when: '28.05.2026, 10:14' },
    { id: 'pl2', listing: '2-комнатная в новостройке', buyer: 'Boulevard Development', type: 'TOP', days: 14, amount: 90000, when: '04.06.2026, 09:02' },
    { id: 'pl3', listing: 'Видовая 3-комнатная в Tashkent City', buyer: 'Nest One Sales', type: 'VIP', days: 30, amount: 350000, when: '28.05.2026, 13:40' },
    { id: 'pl4', listing: 'Уютная 2-комнатная в аренду', buyer: 'Малика Юсупова', type: 'TOP', days: 7, amount: 50000, when: '03.06.2026, 18:21' },
    { id: 'pl5', listing: '3-комнатная рядом с парком', buyer: 'Жасур Тошпулатов', type: 'TOP', days: 14, amount: 90000, when: '20.05.2026, 12:05' },
  ],
  notifications: [
    { id: 'nl1', type: 'LISTING_APPROVED', recipient: 'Дилноза Каримова', channel: 'SMS', status: 'sent', when: '09.06.2026, 16:41' },
    { id: 'nl2', type: 'SAVED_SEARCH_MATCH', recipient: 'Алишер Авинов', channel: 'email', status: 'sent', when: '09.06.2026, 15:00' },
    { id: 'nl3', type: 'NEW_MESSAGE', recipient: 'Boulevard Development', channel: 'push', status: 'sent', when: '09.06.2026, 12:33' },
    { id: 'nl4', type: 'PROMO_EXPIRING', recipient: 'Малика Юсупова', channel: 'SMS', status: 'failed', when: '09.06.2026, 08:10' },
    { id: 'nl5', type: 'LISTING_REJECTED', recipient: 'Рустам Ахмедов', channel: 'email', status: 'sent', when: '08.06.2026, 18:51' },
    { id: 'nl6', type: 'SAVED_SEARCH_MATCH', recipient: 'Озода Рахимова', channel: 'push', status: 'failed', when: '08.06.2026, 07:40' },
    { id: 'nl7', type: 'NEW_MESSAGE', recipient: 'Алишер Авинов', channel: 'SMS', status: 'sent', when: '07.06.2026, 21:18' },
  ],
};

export const ROLES: Role[] = ['User', 'Owner', 'Agent', 'Agency', 'Landlord', 'Moderator'];
export const ROLE_LABEL: Record<Role, string> = {
  User: 'Пользователь', Owner: 'Собственник', Agent: 'Агент', Agency: 'Агентство',
  Landlord: 'Арендодатель', Moderator: 'Модератор', Admin: 'Администратор',
};

export const promoPricing: PromoPricing = {
  TOP: { 7: 50000, 14: 90000, 30: 150000 },
  VIP: { 7: 120000, 14: 200000, 30: 350000 },
};

export const promoHistory: PromoHistoryItem[] = [
  { id: 'p1', listing: 'Просторная 3-комнатная у метро', user: 'Дилноза Каримова', type: 'VIP', days: 30, bought: '28.05.2026', expires: '27.06.2026', status: 'active', amount: 350000 },
  { id: 'p2', listing: '2-комнатная в новостройке', user: 'Boulevard Development', type: 'TOP', days: 14, bought: '04.06.2026', expires: '18.06.2026', status: 'active', amount: 90000 },
  { id: 'p3', listing: 'Видовая 3-комнатная в Tashkent City', user: 'Nest One Sales', type: 'VIP', days: 30, bought: '28.05.2026', expires: '27.06.2026', status: 'active', amount: 350000 },
  { id: 'p4', listing: 'Уютная 2-комнатная в аренду', user: 'Малика Юсупова', type: 'TOP', days: 7, bought: '03.06.2026', expires: '10.06.2026', status: 'active', amount: 50000 },
  { id: 'p5', listing: '3-комнатная рядом с парком', user: 'Жасур Тошпулатов', type: 'TOP', days: 14, bought: '20.05.2026', expires: '03.06.2026', status: 'expired', amount: 90000 },
  { id: 'p6', listing: 'Коммерческое помещение', user: 'Commercial UZ', type: 'VIP', days: 7, bought: '15.05.2026', expires: '22.05.2026', status: 'expired', amount: 120000 },
];
