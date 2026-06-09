/**
 * Продвижение (порт Promotions из scripts/admin-pages.jsx).
 * KPI, редактор тарифов VIP/TOP (черновик + сохранение в локальный state) и история продвижений. 1:1 с прототипом.
 */
'use client';

import { useState } from 'react';
import { SectionTitle } from '@/components/admin/ui/section-title';
import { useToast } from '@/components/admin/toast';
import { ADMIN } from '@/lib/mock';
import type { PromoPricing } from '@/lib/mock';

export default function PromotionsPage() {
  const toast = useToast();
  const history = ADMIN.promoHistory;
  const fmt = (n: number) => Number(n).toLocaleString('ru-RU') + ' сум';

  const [pricing, setPricing] = useState<PromoPricing>(() => JSON.parse(JSON.stringify(ADMIN.promoPricing)));
  const [draft, setDraft] = useState<PromoPricing>(() => JSON.parse(JSON.stringify(ADMIN.promoPricing)));

  const set = (plan: 'TOP' | 'VIP', days: number, val: string) =>
    setDraft((p) => ({ ...p, [plan]: { ...p[plan], [days]: Number(val.replace(/\D/g, '')) } }));

  const dirty = JSON.stringify(draft) !== JSON.stringify(pricing);
  const DAYS = [7, 14, 30];
  const PLANS = [
    ['TOP', 'TOP', 'var(--red)', 'var(--red-bg)'],
    ['VIP', 'VIP', 'var(--gold)', 'var(--gold-bg)'],
  ] as const;
  const active = history.filter((h) => h.status === 'active');
  const revenue = history.reduce((s, h) => s + h.amount, 0);
  const monthRevenue = history.filter((h) => h.bought.endsWith('06.2026')).reduce((s, h) => s + h.amount, 0);

  const onSavePricing = (next: PromoPricing) => setPricing(next);

  return (
    <div>
      <SectionTitle sub="Тарифы и история платных размещений VIP / TOP">Продвижение</SectionTitle>
      <div className="kpi-grid" style={{ marginBottom: 22 }}>
        {([['Активных продвижений', active.length], ['Доход за месяц', fmt(monthRevenue)], ['Всего за период', fmt(revenue)]] as const).map(([l, v]) => (
          <div key={l} className="a-card" style={{ padding: 20 }}><div className="kpi-label">{l}</div><div className="kpi-value">{v}</div></div>
        ))}
      </div>
      <div className="a-card" style={{ padding: 24, marginBottom: 22 }}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
          <h3 style={{ fontSize: 18 }}>Тарифы продвижения</h3>
          <div className="row gap-10">
            <button className="abtn abtn-outline" disabled={!dirty} onClick={() => setDraft(JSON.parse(JSON.stringify(pricing)))}>Отменить</button>
            <button className="abtn abtn-primary" style={{ opacity: dirty ? 1 : 0.5 }} disabled={!dirty} onClick={() => { onSavePricing(JSON.parse(JSON.stringify(draft))); toast('Тарифы обновлены'); }}>Сохранить тарифы</button>
          </div>
        </div>
        <div className="table-scroll">
          <table className="a-table" style={{ minWidth: 520 }}>
            <thead><tr><th>Срок</th><th>TOP — выше в выдаче</th><th>VIP — максимум показов</th></tr></thead>
            <tbody>
              {DAYS.map((d) => (
                <tr key={d}>
                  <td style={{ fontWeight: 700 }}>{d} дней</td>
                  {PLANS.map(([plan]) => (
                    <td key={plan}>
                      <div style={{ position: 'relative', maxWidth: 180 }}>
                        <input className="a-field" style={{ width: '100%', paddingRight: 42, fontWeight: 700 }} inputMode="numeric"
                          value={draft[plan][d] ? Number(draft[plan][d]).toLocaleString('ru-RU') : ''} onChange={(e) => set(plan, d, e.target.value)} />
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
      </div>
      <div className="a-card table-scroll">
        <div style={{ padding: '18px 22px 4px' }}><h3 style={{ fontSize: 18 }}>История продвижений</h3></div>
        <table className="a-table">
          <thead><tr><th>Объявление</th><th>Покупатель</th><th>Тип</th><th>Срок</th><th>Куплено</th><th>Истекает</th><th>Статус</th><th>Сумма</th></tr></thead>
          <tbody>
            {history.map((h) => (
              <tr key={h.id}>
                <td style={{ fontWeight: 600, maxWidth: 220 }}><div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.listing}</div></td>
                <td className="muted" style={{ whiteSpace: 'nowrap' }}>{h.user}</td>
                <td><span className="a-pill" style={{ background: h.type === 'VIP' ? 'var(--gold-bg)' : 'var(--red-bg)', color: h.type === 'VIP' ? 'var(--gold)' : 'var(--red)' }}>{h.type}</span></td>
                <td style={{ whiteSpace: 'nowrap' }}>{h.days} дн.</td>
                <td className="muted" style={{ whiteSpace: 'nowrap' }}>{h.bought}</td>
                <td className="muted" style={{ whiteSpace: 'nowrap' }}>{h.expires}</td>
                <td><span className="a-pill" style={{ background: h.status === 'active' ? 'var(--green-bg)' : 'var(--archive-bg)', color: h.status === 'active' ? 'var(--green)' : 'var(--muted)' }}>{h.status === 'active' ? 'Активно' : 'Истекло'}</span></td>
                <td style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{fmt(h.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
