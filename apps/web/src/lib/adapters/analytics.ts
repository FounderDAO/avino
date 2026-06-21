/**
 * Адаптер: API DTO дашборда (`GET /admin/analytics`) → пропсы SVG-графиков
 * (`LineArea`/`Bars`/`Donut`) и лента «Последних действий». Страница `/admin`
 * остаётся на тех же сигнатурах данных, что и мок; источник — RTK Query.
 */
import type { AdminAnalytics, ModerationAction } from '@/store/api/adminApi';
import type { ActivityItem } from '@/lib/mock';

/** RU-аббревиатуры месяцев (индекс = номер месяца − 1). */
const MONTHS_RU = [
  'Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн',
  'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек',
];

/** Данные всех виджетов дашборда в форме, понятной чарт-компонентам. */
export interface DashboardCharts {
  listingsOverTime: number[];
  months: string[];
  buyRent: { buy: number; rent: number };
  byDistrict: [string, number][];
  activity: ActivityItem[];
}

/** `'2025-07'` → `'Июл'` (фолбэк — исходная строка, если формат неожиданный). */
function monthLabel(ym: string): string {
  const m = Number(ym.slice(5, 7));
  return MONTHS_RU[m - 1] ?? ym;
}

/** Сырые счётчики SALE/RENT → проценты, сумма ровно 100 (без дрожания округления). */
function toBuyRentPct(buy: number, rent: number): { buy: number; rent: number } {
  const total = buy + rent;
  if (total === 0) return { buy: 0, rent: 0 };
  const buyPct = Math.round((buy / total) * 100);
  return { buy: buyPct, rent: 100 - buyPct };
}

/** Действие модерации → глагол для ленты («одобрил/отклонил/…»). */
const ACTION_VERB: Record<ModerationAction, string> = {
  APPROVE: 'одобрил',
  SEND_TO_DRAFT: 'вернул в черновики',
  REJECT: 'отклонил',
  DELETE: 'удалил',
};

const timeFmt = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : timeFmt.format(d);
}

/** `AdminAnalytics` → пропсы виджетов дашборда. */
export function analyticsToCharts(a: AdminAnalytics): DashboardCharts {
  return {
    listingsOverTime: a.listings_over_time.map((p) => p.count),
    months: a.listings_over_time.map((p) => monthLabel(p.month)),
    buyRent: toBuyRentPct(a.buy_rent.buy, a.buy_rent.rent),
    byDistrict: a.by_district.map((d) => [d.name_ru, d.count]),
    activity: a.recent_activity.map((r) => ({
      who: r.moderator_name ?? 'Система',
      act: ACTION_VERB[r.action] ?? 'изменил',
      what: r.listing_title ?? 'объявление',
      time: fmtTime(r.created_at),
    })),
  };
}
