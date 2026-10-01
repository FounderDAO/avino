/**
 * Блок «Возможный дубликат» для карточки модерации и админ-детали объявления.
 *
 * Сам тянет `GET /admin/listings/:id/duplicates` (RTK Query, CLAUDE.md §4) и
 * рендерится ТОЛЬКО при непустом ответе: совпадение по цене + площади +
 * этажности + адресу среди NEW/ACTIVE-объявлений. Клик по строке открывает
 * модалку предпросмотра существующего объявления (стиль — PromoteListingModal);
 * модалка презентационная, данные уже загружены списком.
 */
'use client';

import { useState } from 'react';
import { IC } from '@/components/admin/icons';
import { StatusPill } from '@/components/admin/ui/pill';
import { useGetListingDuplicatesQuery } from '@/store/api/adminListingsApi';
import { duplicateToView } from '@/lib/adapters/listings';
import type { DuplicateCardView } from '@/lib/adapters/listings';

/** Модалка предпросмотра существующего объявления-дубликата. */
function DuplicateListingModal({
  dup,
  onClose,
}: {
  dup: DuplicateCardView;
  onClose: () => void;
}) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(26,26,26,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} className="fade-up a-card" style={{ width: '100%', maxWidth: 460, padding: 26, borderRadius: 16 }}>
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 14 }}>
          <h2 style={{ fontSize: 20 }}>Существующее объявление</h2>
          <button className="aicon-btn" style={{ width: 32, height: 32, border: 'none' }} onClick={onClose}><IC.X size={18} /></button>
        </div>
        <div style={{ aspectRatio: '4/3', borderRadius: 12, overflow: 'hidden', marginBottom: 14 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={dup.photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
        <div className="row gap-8" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="mono muted" style={{ fontSize: 13 }}>{dup.reference}</span>
          <StatusPill status={dup.status} />
        </div>
        <h3 style={{ fontSize: 17, marginTop: 8 }}>{dup.title}</h3>
        <div style={{ fontSize: 20, fontWeight: 800, marginTop: 6 }}>{dup.price}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10, marginTop: 14 }}>
          {([
            ['Адрес', dup.address],
            ['Площадь', dup.area],
            ['Этажность', dup.floors],
            ['Создано', dup.created],
          ] as [string, string][]).map(([k, v]) => (
            <div key={k} style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 13px' }}>
              <div className="muted" style={{ fontSize: 12 }}>{k}</div>
              <div style={{ fontWeight: 600, fontSize: 13.5, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Предупреждение со списком возможных дубликатов; пустой ответ → ничего. */
export function ListingDuplicates({ listingId }: { listingId: string }) {
  const { data } = useGetListingDuplicatesQuery(listingId, { skip: !listingId });
  const [openId, setOpenId] = useState<string | null>(null);

  const duplicates = (data ?? []).map(duplicateToView);
  if (duplicates.length === 0) return null;
  const open = duplicates.find((d) => d.id === openId) ?? null;

  return (
    <div style={{ marginTop: 18, paddingTop: 18, borderTop: '1px solid var(--border)' }}>
      <div className="row gap-8" style={{ background: 'var(--warn-bg)', color: 'var(--warn)', borderRadius: 10, padding: '10px 13px', fontSize: 13.5, fontWeight: 600, alignItems: 'center' }}>
        <IC.Alert size={16} style={{ flexShrink: 0 }} />
        Возможный дубликат — найдено {duplicates.length} совпадений по адресу, этажности, площади и цене
      </div>
      <div style={{ marginTop: 10 }}>
        {duplicates.map((d) => (
          <button
            key={d.id}
            onClick={() => setOpenId(d.id)}
            style={{ display: 'flex', gap: 10, width: '100%', alignItems: 'center', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--surface)', cursor: 'pointer', textAlign: 'left', marginBottom: 6 }}
          >
            <span className="mono" style={{ fontSize: 13, color: 'var(--teal)', flexShrink: 0 }}>{d.reference}</span>
            <span style={{ fontSize: 13.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{d.address}</span>
            <span style={{ fontSize: 13.5, fontWeight: 700, flexShrink: 0 }}>{d.price}</span>
            <StatusPill status={d.status} />
          </button>
        ))}
      </div>
      {open && <DuplicateListingModal dup={open} onClose={() => setOpenId(null)} />}
    </div>
  );
}
