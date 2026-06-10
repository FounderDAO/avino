/**
 * Адаптер: API DTO дашборда (`GET /admin/stats`) → UI-модель KPI-карточек.
 * Цикл 3: страница `/admin` остаётся на той же сигнатуре `kpis: Kpi[]`,
 * источник данных — RTK Query.
 *
 * У бэкенда нет исторических рядов (трендов «за период»), поэтому `delta`/`up`
 * не вычисляются — KPI отдаются без дельты (`delta: ''`), как статичные счётчики.
 */
import type { AdminStats } from '@/store/api/adminApi';
import type { Kpi } from '@/lib/mock';

const numberFmt = new Intl.NumberFormat('ru-RU');

/** Сводные счётчики `AdminStats` → 4 KPI-карточки UI (label/value/accent). */
export function statsToKpis(s: AdminStats): Kpi[] {
  return [
    { label: 'На проверке', value: numberFmt.format(s.listings_new), delta: '', accent: 'warn' },
    { label: 'Жалобы', value: numberFmt.format(s.complaints_new), delta: '' },
    { label: 'Пользователи', value: numberFmt.format(s.users_total), delta: '' },
    { label: 'Активные промо', value: numberFmt.format(s.promotions_active), delta: '' },
  ];
}

/** Карточки-плейсхолдеры на время загрузки / ошибки (без живых значений). */
export function placeholderKpis(value: string): Kpi[] {
  return [
    { label: 'На проверке', value, delta: '', accent: 'warn' },
    { label: 'Жалобы', value, delta: '' },
    { label: 'Пользователи', value, delta: '' },
    { label: 'Активные промо', value, delta: '' },
  ];
}
