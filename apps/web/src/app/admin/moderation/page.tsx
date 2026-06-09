'use client';

/**
 * Экран «Модерация» (порт функции Moderation из scripts/admin-pages.jsx).
 * Очередь объявлений на проверку + детальная карточка с фото, описанием
 * и кнопками одобрить/отклонить. 1:1 с прототипом.
 */
import { useState } from 'react';
import { SectionTitle } from '@/components/admin/ui/section-title';
import { StatusPill } from '@/components/admin/ui/pill';
import { IC } from '@/components/admin/icons';
import { useToast } from '@/components/admin/toast';
import { ADMIN } from '@/lib/mock';
import type { ModerationItem } from '@/lib/mock';

export default function ModerationPage() {
  const toast = useToast();
  const [queue, setQueue] = useState<ModerationItem[]>(ADMIN.moderation);
  const [sel, setSel] = useState<ModerationItem | null>(ADMIN.moderation[0] ?? null);
  const [reason, setReason] = useState('');

  const act = (id: string, ok: boolean) => {
    setQueue((p) => {
      const n = p.filter((x) => x.id !== id);
      setSel(n[0] || null);
      return n;
    });
    toast(ok ? 'Объявление одобрено и опубликовано' : 'Объявление отклонено');
    setReason('');
  };

  return (
    <div>
      <SectionTitle sub={`${queue.length} объявлений ждут проверки`}>Модерация</SectionTitle>
      {queue.length === 0 ? (
        <div className="a-card" style={{ padding: 60, textAlign: 'center' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--green-bg)', color: 'var(--green)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}><IC.Check size={32} strokeWidth={2.4} /></div>
          <h3 style={{ fontSize: 20 }}>Очередь пуста</h3><p className="muted" style={{ marginTop: 4 }}>Все объявления проверены. Отличная работа!</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 18, alignItems: 'start' }} className="mod-grid">
          <div className="a-card" style={{ overflow: 'hidden' }}>
            {queue.map((m) => (
              <button key={m.id} onClick={() => setSel(m)} style={{ display: 'flex', gap: 12, width: '100%', padding: 12, border: 'none', borderBottom: '1px solid var(--border)', background: sel && sel.id === m.id ? 'var(--surface-2)' : 'transparent', textAlign: 'left', cursor: 'pointer' }}>
                <div style={{ width: 56, height: 46, borderRadius: 8, overflow: 'hidden', flexShrink: 0 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={m.photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
                <div style={{ minWidth: 0 }}><div style={{ fontWeight: 600, fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.title}</div><div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{m.agent}</div><StatusPill status="PENDING" /></div>
              </button>
            ))}
          </div>
          {sel && (
            <div className="a-card" style={{ padding: 22 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
                {sel.full.photos.slice(0, 4).map((p, i) => (
                  <div key={i} style={{ aspectRatio: '4/3', borderRadius: 10, overflow: 'hidden' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                ))}
              </div>
              <h2 style={{ fontSize: 22 }}>{sel.title}</h2>
              <div style={{ fontSize: 22, fontWeight: 800, marginTop: 6 }}>{sel.price}</div>
              <div className="row gap-12 muted" style={{ fontSize: 14, marginTop: 8, flexWrap: 'wrap' }}>
                <span>{sel.type}</span><span>·</span><span>{sel.rooms} комн</span><span>·</span><span>{sel.district}</span><span>·</span><span>{sel.agent}</span>
              </div>
              <p style={{ fontSize: 14.5, lineHeight: 1.6, marginTop: 12, color: 'var(--ink-soft)' }}>{sel.full.desc}</p>
              <div style={{ marginTop: 18, paddingTop: 18, borderTop: '1px solid var(--border)' }}>
                <label style={{ fontSize: 13, fontWeight: 700, display: 'block', marginBottom: 7 }}>Причина отклонения (если отклоняете)</label>
                <select className="a-field" style={{ width: '100%', marginBottom: 14 }} value={reason} onChange={(e) => setReason(e.target.value)}>
                  <option value="">— выберите причину —</option>
                  {sel.reasonOptions.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
                <div className="row gap-10">
                  <button className="abtn abtn-ok" style={{ flex: 1 }} onClick={() => act(sel.id, true)}><IC.Check size={18} /> Одобрить</button>
                  <button className="abtn abtn-danger" style={{ flex: 1 }} onClick={() => act(sel.id, false)}><IC.X size={18} /> Отклонить</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
