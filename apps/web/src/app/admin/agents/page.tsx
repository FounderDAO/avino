/**
 * Агенты (порт Agents из scripts/admin-pages.jsx).
 * Сетка карточек профессионалов Avino Pro: объявления, сделки, рейтинг, план. 1:1 с прототипом.
 */
import { SectionTitle } from '@/components/admin/ui/section-title';
import { ADMIN } from '@/lib/mock';

export default function AgentsPage() {
  return (
    <div>
      <SectionTitle sub="Профессионалы Avino Pro">Агенты</SectionTitle>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px,1fr))', gap: 16 }}>
        {ADMIN.agents.map((a) => (
          <div key={a.id} className="a-card" style={{ padding: 20 }}>
            <div className="row gap-12">
              <span style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--mint)', color: 'var(--teal-deep)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 18, flexShrink: 0 }}>{a.name[0]}</span>
              <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 700, fontSize: 15.5, lineHeight: 1.2 }}>{a.name}</div><div className="muted" style={{ fontSize: 13 }}>{a.agency}</div></div>
              <span className="a-pill" style={{ flexShrink: 0, alignSelf: 'flex-start', background: a.plan === 'VIP' ? 'var(--gold-bg)' : 'var(--mint)', color: a.plan === 'VIP' ? 'var(--gold)' : 'var(--teal-deep)' }}>{a.plan}</span>
            </div>
            <div className="row" style={{ justifyContent: 'space-between', marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
              {([['Объявл.', a.listings], ['Сделок', a.deals], ['Рейтинг', '★ ' + a.rating]] as const).map(([l, v]) => (
                <div key={l} style={{ textAlign: 'center' }}><div style={{ fontWeight: 800, fontSize: 17, whiteSpace: 'nowrap' }}>{v}</div><div className="muted" style={{ fontSize: 11.5 }}>{l}</div></div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
