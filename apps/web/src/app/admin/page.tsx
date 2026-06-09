/**
 * Панель управления (порт P.Dashboard из scripts/admin-pages.jsx).
 * KPI-карточки, графики (объявления за год / покупка-аренда / по районам),
 * очередь модерации, последние действия. 1:1 с прототипом.
 */
import Link from 'next/link';
import { SectionTitle } from '@/components/admin/ui/section-title';
import { AdminButton } from '@/components/admin/ui/button';
import { LineArea, Bars, Donut } from '@/components/admin/charts';
import { ADMIN } from '@/lib/mock';

export default function DashboardPage() {
  const { kpis, listingsOverTime, months, buyRent, byDistrict, moderation, activity } = ADMIN;
  return (
    <div>
      <SectionTitle sub="Сводка по платформе Avino · Ташкент">Панель управления</SectionTitle>

      <div className="kpi-grid">
        {kpis.map((k) => (
          <div key={k.label} className="a-card" style={{ padding: 20 }}>
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value" style={{ color: k.accent === 'warn' ? '#C77A12' : 'var(--ink)' }}>{k.value}</div>
            <span className={'delta ' + (k.up ? 'delta-up' : 'delta-down')} style={{ marginTop: 10 }}>
              {k.up ? '↑' : '•'} {k.delta}
            </span>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.7fr 1fr', gap: 18, marginTop: 20 }} className="dash-row">
        <div className="a-card" style={{ padding: 22 }}>
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
            <h3 style={{ fontSize: 17 }}>Объявления за год</h3>
            <span className="muted" style={{ fontSize: 13 }}>+161% за 12 мес</span>
          </div>
          <LineArea data={listingsOverTime} labels={months} />
        </div>
        <div className="a-card" style={{ padding: 22 }}>
          <h3 style={{ fontSize: 17, marginBottom: 8 }}>Покупка / Аренда</h3>
          <div className="col center" style={{ gap: 14 }}>
            <Donut buy={buyRent.buy} rent={buyRent.rent} />
            <div className="row gap-16">
              <span className="row gap-4" style={{ fontSize: 13, fontWeight: 600 }}>
                <span style={{ width: 12, height: 12, borderRadius: 3, background: 'var(--red)' }} /> Покупка {buyRent.buy}%
              </span>
              <span className="row gap-4" style={{ fontSize: 13, fontWeight: 600 }}>
                <span style={{ width: 12, height: 12, borderRadius: 3, background: 'var(--teal)' }} /> Аренда {buyRent.rent}%
              </span>
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 18, marginTop: 20 }} className="dash-row">
        <div className="a-card" style={{ padding: 22 }}>
          <h3 style={{ fontSize: 17, marginBottom: 14 }}>Объявления по районам</h3>
          <Bars data={byDistrict} />
        </div>
        <div className="a-card" style={{ padding: 22 }}>
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
            <h3 style={{ fontSize: 17 }}>Очередь модерации</h3>
            <AdminButton variant="ghost" size="sm" asChild>
              <Link href="/admin/moderation">Открыть очередь →</Link>
            </AdminButton>
          </div>
          <div className="col">
            {moderation.map((m) => (
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
                  <Link href="/admin/moderation">Проверить</Link>
                </AdminButton>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="a-card" style={{ padding: 22, marginTop: 20 }}>
        <h3 style={{ fontSize: 17, marginBottom: 6 }}>Последние действия</h3>
        <div>
          {activity.map((a, i) => (
            <div key={i} className="row gap-12" style={{ padding: '11px 0', borderTop: i ? '1px solid var(--border)' : 'none', fontSize: 14 }}>
              <span style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--mint)', color: 'var(--teal)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, flexShrink: 0 }}>{a.who[0]}</span>
              <span style={{ flex: 1 }}><b>{a.who}</b> {a.act} <span className="muted">«{a.what}»</span></span>
              <span className="muted" style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>{a.time}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
