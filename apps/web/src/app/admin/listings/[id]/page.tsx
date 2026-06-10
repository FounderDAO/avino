/**
 * Детальная объявления на реальном API (GET /listings/:id через RTK Query).
 * Галерея, параметры, статистика, панель действий модератора. Действия пока
 * локальные (статус через useState + toast) — реальные мутации модерации (PATCH
 * /admin/listings/:id/status) подключаются отдельной задачей. Вёрстка 1:1.
 */
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { StatusPill } from '@/components/admin/ui/pill';
import { AdminButton } from '@/components/admin/ui/button';
import { IC } from '@/components/admin/icons';
import { useToast } from '@/components/admin/toast';
import { useGetAdminListingQuery } from '@/store/api/adminListingsApi';
import { detailToAdminListing } from '@/lib/adapters/listings';
import { ADMIN } from '@/lib/mock';
import type { AdminListingStatus } from '@/lib/mock';

export default function ListingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const { data, isLoading, isError, error, refetch } = useGetAdminListingQuery(id);
  const [override, setOverride] = useState<AdminListingStatus | null>(null);

  const listing = data ? detailToAdminListing(data) : undefined;
  const status: AdminListingStatus = override ?? listing?.status ?? 'ACTIVE';

  if (isLoading) {
    return <div className="a-card" style={{ padding: 40 }}>Загрузка…</div>;
  }

  if (isError || !listing) {
    const notFound = (error as { status?: number } | undefined)?.status === 404;
    return (
      <div className="a-card" style={{ padding: 40 }}>
        {notFound ? 'Объявление не найдено.' : 'Не удалось загрузить объявление.'}{' '}
        {!notFound && <button className="abtn abtn-outline abtn-sm" style={{ marginRight: 8 }} onClick={() => refetch()}>Повторить</button>}
        <AdminButton variant="ghost" asChild>
          <Link href="/admin/listings">← Назад</Link>
        </AdminButton>
      </div>
    );
  }

  const src = listing.priceRaw;
  const onSetStatus = (next: AdminListingStatus) => {
    setOverride(next);
    if (next === 'ACTIVE') toast('Объявление опубликовано');
    else if (next === 'REJECTED') toast('Объявление отклонено');
    else if (next === 'ARCHIVED') toast('Перемещено в архив');
  };

  return (
    <div className="fade-up">
      <AdminButton variant="ghost" size="sm" asChild style={{ marginBottom: 14, paddingLeft: 0 }}>
        <Link href="/admin/listings"><IC.ChevronLeft size={17} /> Все объявления</Link>
      </AdminButton>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20, alignItems: 'start' }} className="dash-row">
        <div className="col gap-20">
          <div className="a-card" style={{ padding: 22 }}>
            {src.photos.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
                {src.photos.slice(0, 4).map((p, i) => (
                  <div key={i} style={{ aspectRatio: '4/3', borderRadius: 10, overflow: 'hidden' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                ))}
              </div>
            )}
            <div className="row gap-8" style={{ marginBottom: 8, flexWrap: 'wrap' }}>
              <StatusPill status={status} />
              {listing.promo !== 'NORMAL' && <span className="a-pill" style={{ background: listing.promo === 'VIP' ? 'var(--gold-bg)' : 'var(--red-bg)', color: listing.promo === 'VIP' ? 'var(--gold)' : 'var(--red)' }}>{listing.promo}</span>}
              <span className="a-pill" style={{ background: 'var(--mint)', color: 'var(--teal-deep)' }}>{listing.tx}</span>
            </div>
            <h2 style={{ fontSize: 24, lineHeight: 1.2 }}>{listing.title}</h2>
            <div style={{ fontSize: 26, fontWeight: 800, marginTop: 10 }}>{listing.price}</div>
            <div className="row gap-12 muted" style={{ fontSize: 14, marginTop: 8, flexWrap: 'wrap' }}>
              <span>{listing.type}</span><span>·</span><span>{listing.rooms} комн</span><span>·</span><span>{src.area ?? '—'} м²</span><span>·</span><span>{listing.district}</span>
            </div>
            {src.desc && <p style={{ fontSize: 14.5, lineHeight: 1.6, marginTop: 14, color: 'var(--ink-soft)' }}>{src.desc}</p>}
            <div className="row wrap gap-8" style={{ marginTop: 14 }}>
              {src.features.map((f) => <span key={f} className="a-pill" style={{ background: 'var(--surface-2)', color: 'var(--ink)', border: '1px solid var(--border)' }}>{f}</span>)}
            </div>
          </div>
          <div className="a-card" style={{ padding: 22 }}>
            <h3 style={{ fontSize: 16, marginBottom: 12 }}>Параметры</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10 }}>
              {([['ID объявления', listing.id], ['Автор', listing.agent], ['Адрес', src.address], ['Год постройки', src.year || '—'], ['Этаж', src.floor ? `${src.floor}/${src.totalFloors}` : '—'], ['Создано', listing.created]] as [string, string | number][]).map(([k, v]) => (
                <div key={k} style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 13px' }}><div className="muted" style={{ fontSize: 12 }}>{k}</div><div style={{ fontWeight: 600, fontSize: 14, marginTop: 2 }}>{v}</div></div>
              ))}
            </div>
          </div>
        </div>
        <div className="col gap-16">
          <div className="a-card" style={{ padding: 20 }}>
            <h3 style={{ fontSize: 15, marginBottom: 6 }}>Статистика</h3>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              {([['Просмотры', listing.views], ['Статус', ADMIN.STATUS_MAP[status][0]]] as [string, string | number][]).map(([k, v]) => (
                <div key={k}><div style={{ fontWeight: 800, fontSize: 18 }}>{v}</div><div className="muted" style={{ fontSize: 11.5 }}>{k}</div></div>
              ))}
            </div>
          </div>
          <div className="a-card" style={{ padding: 20 }}>
            <h3 style={{ fontSize: 15, marginBottom: 14 }}>Действия модератора</h3>
            <div className="col gap-10">
              {status !== 'ACTIVE' && <button className="abtn abtn-ok" style={{ width: '100%' }} onClick={() => onSetStatus('ACTIVE')}><IC.Check size={17} /> Опубликовать</button>}
              {status !== 'REJECTED' && <button className="abtn abtn-danger" style={{ width: '100%' }} onClick={() => onSetStatus('REJECTED')}><IC.X size={17} /> Отклонить</button>}
              {status !== 'ARCHIVED' && <button className="abtn abtn-outline" style={{ width: '100%' }} onClick={() => onSetStatus('ARCHIVED')}>В архив</button>}
              <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
              <button className="abtn abtn-outline" style={{ width: '100%' }} onClick={() => toast('Редактирование объявления')}>Редактировать</button>
              <button className="abtn abtn-outline" style={{ width: '100%' }} onClick={() => toast(listing.promo === 'NORMAL' ? 'Выдать VIP/TOP' : 'Снять продвижение')}>{listing.promo === 'NORMAL' ? 'Продвинуть (VIP/TOP)' : 'Снять продвижение'}</button>
              <button className="abtn abtn-danger" style={{ width: '100%' }} onClick={() => toast('Удаление требует подтверждения')}>Удалить</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
