/**
 * Панель управления (порт P.Dashboard из scripts/admin-pages.jsx).
 * Полностью на живых данных:
 * - KPI-карточки — `GET /admin/stats` (RTK Query + адаптер);
 * - графики (объявления за год / покупка-аренда / по районам) и лента
 *   «Последних действий» — `GET /admin/analytics` (адаптер `analyticsToCharts`);
 * - очередь модерации — `GET /admin/listings?status=NEW`.
 * Состояния загрузки/ошибки/пустоты показываются явно (без подмены моками).
 * Вёрстка 1:1 с прототипом.
 */
'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { SectionTitle } from '@/components/admin/ui/section-title';
import { AdminButton } from '@/components/admin/ui/button';
import { LineArea, Bars, Donut } from '@/components/admin/charts';
import { useGetAdminStatsQuery } from '@/store/api/adminStatsApi';
import { useGetAdminAnalyticsQuery } from '@/store/api/adminAnalyticsApi';
import { useListAdminListingsQuery } from '@/store/api/adminListingsApi';
import { statsToKpis, placeholderKpis } from '@/lib/adapters/stats';
import { analyticsToCharts } from '@/lib/adapters/analytics';
import { rowToAdminListing } from '@/lib/adapters/listings';

/** Заглушка внутри карточки графика (загрузка / ошибка / нет данных). */
function ChartHint({ children }: { children: ReactNode }) {
  return (
    <div
      className="muted center"
      style={{ minHeight: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13.5 }}
    >
      {children}
    </div>
  );
}

export default function DashboardPage() {
  // KPI — живые счётчики дашборда. Loading → «…», error → «—».
  const { data: stats, isLoading: statsLoading, isError: statsError } = useGetAdminStatsQuery();
  const kpis = stats
    ? statsToKpis(stats)
    : placeholderKpis(statsError ? '—' : statsLoading ? '…' : '—');

  // Графики и лента действий — живые ряды из /admin/analytics.
  const { data: analytics, isLoading: chartsLoading, isError: chartsError } = useGetAdminAnalyticsQuery();
  const charts = analytics ? analyticsToCharts(analytics) : null;
  const chartHint = chartsError ? 'Не удалось загрузить' : 'Загрузка…';

  // Очередь модерации — первые NEW-листинги (read-only переиспользование адаптера).
  const { data: queueData, isLoading: queueLoading } = useListAdminListingsQuery({
    status: 'NEW',
    page: 1,
    limit: 4,
  });
  const moderation = (queueData?.data ?? []).map(rowToAdminListing);

  return (
    <div>
      <SectionTitle sub="Сводка по платформе Avino · Ташкент">Панель управления</SectionTitle>

      <div className="kpi-grid">
        {kpis.map((k) => (
          <div key={k.label} className="a-card" style={{ padding: 20 }}>
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value" style={{ color: k.accent === 'warn' ? '#C77A12' : 'var(--ink)' }}>{k.value}</div>
            {k.delta ? (
              <span className={'delta ' + (k.up ? 'delta-up' : 'delta-down')} style={{ marginTop: 10 }}>
                {k.up ? '↑' : '•'} {k.delta}
              </span>
            ) : null}
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.7fr 1fr', gap: 18, marginTop: 20 }} className="dash-row">
        <div className="a-card" style={{ padding: 22 }}>
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
            <h3 style={{ fontSize: 17 }}>Объявления за год</h3>
            <span className="muted" style={{ fontSize: 13 }}>за 12 месяцев</span>
          </div>
          {charts ? (
            <LineArea data={charts.listingsOverTime} labels={charts.months} />
          ) : (
            <ChartHint>{chartHint}</ChartHint>
          )}
        </div>
        <div className="a-card" style={{ padding: 22 }}>
          <h3 style={{ fontSize: 17, marginBottom: 8 }}>Покупка / Аренда</h3>
          {charts ? (
            <div className="col center" style={{ gap: 14 }}>
              <Donut buy={charts.buyRent.buy} rent={charts.buyRent.rent} />
              <div className="row gap-16">
                <span className="row gap-4" style={{ fontSize: 13, fontWeight: 600 }}>
                  <span style={{ width: 12, height: 12, borderRadius: 3, background: 'var(--red)' }} /> Покупка {charts.buyRent.buy}%
                </span>
                <span className="row gap-4" style={{ fontSize: 13, fontWeight: 600 }}>
                  <span style={{ width: 12, height: 12, borderRadius: 3, background: 'var(--teal)' }} /> Аренда {charts.buyRent.rent}%
                </span>
              </div>
            </div>
          ) : (
            <ChartHint>{chartHint}</ChartHint>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 18, marginTop: 20 }} className="dash-row">
        <div className="a-card" style={{ padding: 22 }}>
          <h3 style={{ fontSize: 17, marginBottom: 14 }}>Объявления по районам</h3>
          {charts && charts.byDistrict.length > 0 ? (
            <Bars data={charts.byDistrict} />
          ) : (
            <ChartHint>{charts ? 'Недостаточно данных' : chartHint}</ChartHint>
          )}
        </div>
        <div className="a-card" style={{ padding: 22 }}>
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
            <h3 style={{ fontSize: 17 }}>Очередь модерации</h3>
            <AdminButton variant="ghost" size="sm" asChild>
              <Link href="/admin/moderation">Открыть очередь →</Link>
            </AdminButton>
          </div>
          <div className="col">
            {queueLoading ? (
              <div className="muted" style={{ padding: '11px 0', fontSize: 13 }}>Загрузка…</div>
            ) : moderation.length === 0 ? (
              <div className="muted" style={{ padding: '11px 0', fontSize: 13 }}>Очередь пуста.</div>
            ) : (
              moderation.map((m) => (
                <div key={m.id} className="row gap-12" style={{ padding: '11px 0', borderTop: '1px solid var(--border)' }}>
                  <div style={{ width: 46, height: 38, borderRadius: 8, overflow: 'hidden', flexShrink: 0 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={m.photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.title}</div>
                    <div className="muted" style={{ fontSize: 12 }}>{m.agent} · {m.created}</div>
                  </div>
                  <AdminButton variant="primary" size="sm" asChild>
                    <Link href={`/admin/listings/${m.id}`}>Проверить</Link>
                  </AdminButton>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="a-card" style={{ padding: 22, marginTop: 20 }}>
        <h3 style={{ fontSize: 17, marginBottom: 6 }}>Последние действия</h3>
        <div>
          {!charts ? (
            <div className="muted" style={{ padding: '11px 0', fontSize: 13 }}>{chartHint}</div>
          ) : charts.activity.length === 0 ? (
            <div className="muted" style={{ padding: '11px 0', fontSize: 13 }}>Пока нет действий.</div>
          ) : (
            charts.activity.map((a, i) => (
              <div key={i} className="row gap-12" style={{ padding: '11px 0', borderTop: i ? '1px solid var(--border)' : 'none', fontSize: 14 }}>
                <span style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--mint)', color: 'var(--teal)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, flexShrink: 0 }}>{a.who[0]}</span>
                <span style={{ flex: 1 }}><b>{a.who}</b> {a.act} <span className="muted">«{a.what}»</span></span>
                <span className="muted" style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>{a.time}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
