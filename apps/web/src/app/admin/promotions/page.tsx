/**
 * Продвижение — тарифы VIP/TOP и настройки на реальном API (RTK Query).
 *
 * Цикл 3: вёрстка 1:1 с прототипом, источник цен — `GET /admin/promotion-plans`
 * + адаптер `plansToPricing`. Редактирование цены/активности тарифа →
 * `PATCH /admin/promotion-plans/:id` (адресуем по `plan.id` через индекс).
 * Настройки (интервал проверки истечения) — `GET/PATCH /admin/promotion-settings`.
 *
 * История продвижений и KPI — живые (ADMIN-16): `GET /admin/promotions`
 * (глобальный ledger, фильтры type/status, серверная пагинация) и
 * `GET /admin/promotions/summary` (активные, выручка месяц/всего).
 */
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { SectionTitle } from '@/components/admin/ui/section-title';
import { IC } from '@/components/admin/icons';
import { useToast } from '@/components/admin/toast';
import type { PromoPricing } from '@/lib/mock';
import {
  useGetPromotionPlansQuery,
  useUpdatePromotionPlanMutation,
  useGetPromotionSettingsQuery,
  useUpdatePromotionSettingsMutation,
  useListAdminPromotionsQuery,
  useGetPromotionsSummaryQuery,
} from '@/store/api/adminPromotionsApi';
import { DEFAULT_LIMIT, totalPages } from '@/store/api/adminApi';
import type { PromotionStatus } from '@/store/api/adminTypes';
import {
  plansToPricing,
  plansToIndex,
  findPlan,
  promotionToHistoryRow,
  PROMO_DAYS,
  PROMOTION_STATUS_MAP,
  type PromoPlanType,
} from '@/lib/adapters/promotions';
import { getApiErrorCode } from '@/store/api/apiError';

const PLANS = [
  ['TOP', 'TOP', 'var(--red)', 'var(--red-bg)'],
  ['VIP', 'VIP', 'var(--gold)', 'var(--gold-bg)'],
] as const;

const INTERVALS: (6 | 12)[] = [6, 12];

export default function PromotionsPage() {
  const toast = useToast();
  const fmt = (n: number) => Number(n).toLocaleString('en-US') + ' сум';

  const {
    data: plans,
    isLoading: plansLoading,
    isError: plansError,
    refetch: refetchPlans,
  } = useGetPromotionPlansQuery();
  const [updatePlan, { isLoading: savingPlan }] = useUpdatePromotionPlanMutation();

  const {
    data: settings,
    isError: settingsError,
  } = useGetPromotionSettingsQuery();
  const [updateSettings, { isLoading: savingSettings }] =
    useUpdatePromotionSettingsMutation();

  // Цены из API → плоская таблица для вёрстки + индекс с планами (для PATCH по id).
  const pricing = useMemo<PromoPricing>(
    () => plansToPricing(plans ?? []),
    [plans],
  );
  const index = useMemo(() => plansToIndex(plans ?? []), [plans]);

  // Локальный черновик цен поверх серверного значения. Ключ — JSON pricing, чтобы
  // черновик пересоздавался при перезагрузке тарифов из API.
  const [draft, setDraft] = useState<PromoPricing>(pricing);
  const [draftKey, setDraftKey] = useState<string>('');
  const pricingKey = JSON.stringify(pricing);
  if (pricingKey !== draftKey) {
    setDraft(pricing);
    setDraftKey(pricingKey);
  }

  const set = (plan: PromoPlanType, days: number, val: string) =>
    setDraft((p) => ({
      ...p,
      [plan]: { ...p[plan], [days]: Number(val.replace(/\D/g, '')) },
    }));

  const dirty = JSON.stringify(draft) !== pricingKey;

  // KPI — живая сводка ledger'а: активные промо + выручка (месяц/всего).
  const {
    data: summary,
    isLoading: summaryLoading,
    isError: summaryError,
  } = useGetPromotionsSummaryQuery();
  const kpiPlaceholder = summaryError ? '—' : summaryLoading ? '…' : '—';
  const kpis: [string, string][] = summary
    ? [
        ['Активных продвижений', String(summary.active_count)],
        ['Доход за месяц', fmt(Number(summary.revenue_month))],
        ['Всего за период', fmt(Number(summary.revenue_total))],
      ]
    : [
        ['Активных продвижений', kpiPlaceholder],
        ['Доход за месяц', kpiPlaceholder],
        ['Всего за период', kpiPlaceholder],
      ];

  // История промо — глобальный ledger с фильтрами и серверной пагинацией.
  const [histType, setHistType] = useState<'ALL' | 'TOP' | 'VIP'>('ALL');
  const [histStatus, setHistStatus] = useState<'ALL' | PromotionStatus>('ALL');
  const [histPage, setHistPage] = useState(1);

  // Смена фильтра — на первую страницу.
  useEffect(() => {
    setHistPage(1);
  }, [histType, histStatus]);

  const {
    data: histData,
    isLoading: histLoading,
    isFetching: histFetching,
    isError: histError,
    refetch: refetchHist,
  } = useListAdminPromotionsQuery({
    type: histType === 'ALL' ? undefined : histType,
    status: histStatus === 'ALL' ? undefined : histStatus,
    page: histPage,
    limit: DEFAULT_LIMIT,
  });
  const histRows = (histData?.data ?? []).map(promotionToHistoryRow);
  const histTotal = histData?.meta.total ?? 0;
  const histPages = totalPages(histData?.meta);

  // Сохранение тарифов: PATCH /admin/promotion-plans/:id только для изменённых цен.
  async function onSavePricing() {
    const changed: { id: string; price: string }[] = [];
    for (const [plan] of PLANS) {
      for (const days of PROMO_DAYS) {
        const next = draft[plan][days];
        const prev = pricing[plan][days];
        if (next === prev) continue;
        const found = findPlan(index, plan, days);
        if (!found) continue;
        changed.push({ id: found.id, price: String(next) });
      }
    }
    if (changed.length === 0) return;
    try {
      await Promise.all(
        changed.map(({ id, price }) => updatePlan({ id, body: { price } }).unwrap()),
      );
      toast('Тарифы обновлены');
    } catch (e) {
      toast(`Не удалось сохранить тарифы${codeSuffix(e)}`);
    }
  }

  async function onChangeInterval(value: 6 | 12) {
    if (value === settings?.expiryIntervalHours) return;
    try {
      await updateSettings({ expiryIntervalHours: value }).unwrap();
      toast('Настройки сохранены');
    } catch (e) {
      toast(`Не удалось сохранить настройки${codeSuffix(e)}`);
    }
  }

  return (
    <div>
      <SectionTitle sub="Тарифы и история платных размещений VIP / TOP">Продвижение</SectionTitle>
      <div className="kpi-grid" style={{ marginBottom: 22 }}>
        {kpis.map(([l, v]) => (
          <div key={l} className="a-card" style={{ padding: 20 }}><div className="kpi-label">{l}</div><div className="kpi-value">{v}</div></div>
        ))}
      </div>
      <div className="a-card" style={{ padding: 24, marginBottom: 22 }}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
          <h3 style={{ fontSize: 18 }}>Тарифы продвижения</h3>
          <div className="row gap-10">
            <button className="abtn abtn-outline" disabled={!dirty || savingPlan} onClick={() => setDraft(pricing)}>Отменить</button>
            <button className="abtn abtn-primary" style={{ opacity: dirty ? 1 : 0.5 }} disabled={!dirty || savingPlan} onClick={onSavePricing}>{savingPlan ? 'Сохранение…' : 'Сохранить тарифы'}</button>
          </div>
        </div>
        {plansError ? (
          <div style={{ padding: 24, textAlign: 'center' }}>
            <p className="muted" style={{ marginBottom: 12 }}>Не удалось загрузить тарифы.</p>
            <button className="abtn abtn-outline" onClick={() => refetchPlans()}>Повторить</button>
          </div>
        ) : plansLoading ? (
          <div className="muted" style={{ padding: 24, textAlign: 'center' }}>Загрузка…</div>
        ) : (
          <>
            <div className="table-scroll">
              <table className="a-table" style={{ minWidth: 520 }}>
                <thead><tr><th>Срок</th><th>TOP — выше в выдаче</th><th>VIP — максимум показов</th></tr></thead>
                <tbody>
                  {PROMO_DAYS.map((d) => (
                    <tr key={d}>
                      <td style={{ fontWeight: 700 }}>{d} дней</td>
                      {PLANS.map(([plan]) => (
                        <td key={plan}>
                          <div style={{ position: 'relative', maxWidth: 180 }}>
                            <input className="a-field" style={{ width: '100%', paddingRight: 42, fontWeight: 700 }} inputMode="numeric"
                              value={draft[plan][d] ? Number(draft[plan][d]).toLocaleString('en-US') : ''} onChange={(e) => set(plan, d, e.target.value)} />
                            <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', fontSize: 13, fontWeight: 600 }}>сум</span>
                          </div>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="row gap-16" style={{ marginTop: 14, flexWrap: 'wrap' }}>
              {PLANS.map(([plan, label, c, bg]) => (
                <span key={plan} className="row gap-8" style={{ fontSize: 13, fontWeight: 600 }}><span className="a-pill" style={{ background: bg, color: c }}>{label}</span> {plan === 'TOP' ? 'поднимает в списке выдачи' : 'премиальный бейдж + топ позиции'}</span>
              ))}
            </div>
          </>
        )}
      </div>
      <div className="a-card" style={{ padding: 24, marginBottom: 22 }}>
        <h3 style={{ fontSize: 18, marginBottom: 6 }}>Проверка истечения промо</h3>
        <p className="muted" style={{ fontSize: 13.5, marginBottom: 16 }}>Как часто фоновая задача снимает истёкшие VIP / TOP.</p>
        {settingsError ? (
          <p className="muted">Не удалось загрузить настройки.</p>
        ) : (
          <div className="row gap-10" style={{ flexWrap: 'wrap' }}>
            {INTERVALS.map((value) => {
              const selected = settings?.expiryIntervalHours === value;
              return (
                <button key={value} className="abtn abtn-sm" disabled={savingSettings} onClick={() => onChangeInterval(value)}
                  style={{ background: selected ? 'var(--ink)' : 'var(--surface)', color: selected ? '#fff' : 'var(--ink)', border: selected ? 'none' : '1.5px solid var(--border)' }}>
                  Каждые {value} ч
                </button>
              );
            })}
          </div>
        )}
      </div>
      <div className="a-card table-scroll">
        <div className="row" style={{ padding: '18px 22px 4px', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <h3 style={{ fontSize: 18 }}>История продвижений</h3>
          <div className="row gap-8" style={{ flexWrap: 'wrap' }}>
            <select className="a-field" value={histType} onChange={(e) => setHistType(e.target.value as 'ALL' | 'TOP' | 'VIP')}>
              <option value="ALL">Все тарифы</option>
              <option value="TOP">TOP</option>
              <option value="VIP">VIP</option>
            </select>
            <select className="a-field" value={histStatus} onChange={(e) => setHistStatus(e.target.value as 'ALL' | PromotionStatus)}>
              <option value="ALL">Все статусы</option>
              {(Object.keys(PROMOTION_STATUS_MAP) as PromotionStatus[]).map((s) => (
                <option key={s} value={s}>{PROMOTION_STATUS_MAP[s][0]}</option>
              ))}
            </select>
          </div>
        </div>
        <table className="a-table">
          <thead><tr><th>Объявление</th><th>Покупатель</th><th>Тип</th><th>Срок</th><th>Куплено</th><th>Истекает</th><th>Статус</th><th>Сумма</th></tr></thead>
          <tbody>
            {histError ? (
              <tr><td colSpan={8} className="muted" style={{ textAlign: 'center', padding: 40 }}>
                <div style={{ marginBottom: 12 }}>Не удалось загрузить историю.</div>
                <button className="abtn abtn-outline" onClick={() => refetchHist()}>Повторить</button>
              </td></tr>
            ) : histLoading ? (
              <tr><td colSpan={8} className="muted" style={{ textAlign: 'center', padding: 40 }}>Загрузка…</td></tr>
            ) : histRows.length === 0 ? (
              <tr><td colSpan={8} className="muted" style={{ textAlign: 'center', padding: 40 }}>Продвижений пока не было.</td></tr>
            ) : (
              histRows.map((h) => {
                const [statusLabel, statusColor, statusBg] = PROMOTION_STATUS_MAP[h.status];
                return (
                  <tr key={h.id}>
                    <td style={{ fontWeight: 600, maxWidth: 220 }}>
                      <Link href={`/admin/listings/${h.listingId}`} style={{ color: 'var(--teal)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={h.listing}>
                        {h.listing}
                      </Link>
                    </td>
                    <td className="muted mono" style={{ whiteSpace: 'nowrap' }}>{h.buyer}</td>
                    <td><span className="a-pill" style={{ background: h.type === 'VIP' ? 'var(--gold-bg)' : 'var(--red-bg)', color: h.type === 'VIP' ? 'var(--gold)' : 'var(--red)' }}>{h.type}</span></td>
                    <td style={{ whiteSpace: 'nowrap' }}>{h.days} дн.</td>
                    <td className="muted" style={{ whiteSpace: 'nowrap' }}>{h.bought}</td>
                    <td className="muted" style={{ whiteSpace: 'nowrap' }}>{h.expires}</td>
                    <td><span className="a-pill" style={{ background: statusBg, color: statusColor }}>{statusLabel}</span></td>
                    <td style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{h.amount}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <div className="row" style={{ justifyContent: 'space-between', marginTop: 14, fontSize: 13.5, color: 'var(--muted)' }}>
        <span>{histFetching ? 'Обновление…' : `Показано ${histRows.length} из ${histTotal}`}</span>
        <div className="row gap-4">
          <button className="aicon-btn" style={{ width: 32, height: 32 }} disabled={histPage <= 1} onClick={() => setHistPage((p) => Math.max(1, p - 1))}><IC.ChevronLeft size={16} /></button>
          <button className="abtn abtn-sm" style={{ background: 'var(--ink)', color: '#fff' }}>{histPage}</button>
          <button className="aicon-btn" style={{ width: 32, height: 32 }} disabled={histPages > 0 && histPage >= histPages} onClick={() => setHistPage((p) => p + 1)}><IC.ChevronRight size={16} /></button>
        </div>
      </div>
    </div>
  );
}

/** Суффикс с кодом ошибки API для toast (или пусто). */
function codeSuffix(e: unknown): string {
  const code = getApiErrorCode(e as Parameters<typeof getApiErrorCode>[0]);
  return code ? ` (${code})` : '';
}
