/**
 * Детальная объявления на реальном API (GET /listings/:id через RTK Query).
 * Галерея, параметры, статистика, панель действий модератора и история
 * модерации. Действия модерации — реальная мутация
 * PATCH /admin/listings/:id/status (APPROVE/SEND_TO_DRAFT/REJECT/DELETE);
 * история — GET /admin/listings/:id/moderation-logs. После действия тег `Admin`
 * инвалидируется → карточка и история перечитываются. Вёрстка 1:1.
 */
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { StatusPill } from '@/components/admin/ui/pill';
import { AdminButton } from '@/components/admin/ui/button';
import { IC } from '@/components/admin/icons';
import { useToast } from '@/components/admin/toast';
import {
  useGetAdminListingQuery,
  useModerateListingMutation,
  useListingModerationLogsQuery,
} from '@/store/api/adminListingsApi';
import { detailToAdminListing, REJECT_REASON_OPTIONS } from '@/lib/adapters/listings';
import { getApiError, getApiErrorCode } from '@/store/api/apiError';
import type { AdminListingStatus } from '@/lib/mock';
import type { ModerationAction } from '@/store/api/adminTypes';

/** Человекочитаемые подписи статусов (RU) — заменяет ADMIN.STATUS_MAP. */
const STATUS_LABEL: Record<AdminListingStatus, string> = {
  ACTIVE: 'Опубликовано',
  PENDING: 'На проверке',
  REJECTED: 'Отклонено',
  DRAFT: 'Черновик',
  ARCHIVED: 'В архиве',
};

const ACTION_LABEL: Record<ModerationAction, string> = {
  APPROVE: 'Одобрено',
  SEND_TO_DRAFT: 'В черновики',
  REJECT: 'Отклонено',
  DELETE: 'Удалено',
};

const logDateFmt = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** Человекочитаемый текст ошибки модерации (RU) по коду/статусу API. */
function moderationErrorMessage(error: unknown): string {
  const e = error as { status?: number } | undefined;
  const code = getApiErrorCode(error as never);
  const status = e?.status;
  if (status === 422 || code === 'INVALID_STATUS_TRANSITION') {
    return 'Недопустимый переход статуса для этого объявления.';
  }
  if (status === 403) return 'Недостаточно прав для этого действия.';
  if (status === 404) return 'Объявление не найдено.';
  return getApiError(error as never)?.message ?? 'Не удалось выполнить действие.';
}

export default function ListingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const { data, isLoading, isError, error, refetch } = useGetAdminListingQuery(id);
  const [reason, setReason] = useState('');
  const [moderate, { isLoading: isActing }] = useModerateListingMutation();
  const { data: logs, isLoading: logsLoading, isError: logsError } =
    useListingModerationLogsQuery(id);

  const listing = data ? detailToAdminListing(data) : undefined;
  const status: AdminListingStatus = listing?.status ?? 'ACTIVE';

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

  const act = async (action: ModerationAction) => {
    if (action === 'REJECT' && !reason) {
      toast('Выберите причину отклонения');
      return;
    }
    try {
      await moderate({
        id,
        body: { action, reason: action === 'REJECT' ? reason : undefined },
      }).unwrap();
      if (action === 'APPROVE') toast('Объявление опубликовано');
      else if (action === 'SEND_TO_DRAFT') toast('Возвращено в черновики');
      else if (action === 'REJECT') toast('Объявление отклонено');
      else if (action === 'DELETE') toast('Объявление удалено');
      setReason('');
    } catch (err) {
      toast(moderationErrorMessage(err));
    }
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
          <div className="a-card" style={{ padding: 22 }}>
            <h3 style={{ fontSize: 16, marginBottom: 12 }}>История модерации</h3>
            {logsLoading ? (
              <p className="muted" style={{ fontSize: 13.5 }}>Загрузка…</p>
            ) : logsError ? (
              <p className="muted" style={{ fontSize: 13.5 }}>Не удалось загрузить историю.</p>
            ) : !logs || logs.length === 0 ? (
              <p className="muted" style={{ fontSize: 13.5 }}>Действий модерации пока нет.</p>
            ) : (
              <div className="table-scroll">
                <table className="a-table">
                  <thead><tr><th>Действие</th><th>Статус</th><th>Причина</th><th>Когда</th></tr></thead>
                  <tbody>
                    {logs.map((log) => (
                      <tr key={log.id}>
                        <td style={{ fontWeight: 600 }}>{ACTION_LABEL[log.action] ?? log.action}</td>
                        <td className="muted">{log.old_status ?? '—'} → {log.new_status ?? '—'}</td>
                        <td className="muted">{log.reason || '—'}</td>
                        <td className="muted" style={{ whiteSpace: 'nowrap' }}>{Number.isNaN(new Date(log.created_at).getTime()) ? '—' : logDateFmt.format(new Date(log.created_at))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
        <div className="col gap-16">
          <div className="a-card" style={{ padding: 20 }}>
            <h3 style={{ fontSize: 15, marginBottom: 6 }}>Статистика</h3>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              {([['Просмотры', listing.views], ['Статус', STATUS_LABEL[status]]] as [string, string | number][]).map(([k, v]) => (
                <div key={k}><div style={{ fontWeight: 800, fontSize: 18 }}>{v}</div><div className="muted" style={{ fontSize: 11.5 }}>{k}</div></div>
              ))}
            </div>
          </div>
          <div className="a-card" style={{ padding: 20 }}>
            <h3 style={{ fontSize: 15, marginBottom: 14 }}>Действия модератора</h3>
            <div className="col gap-10">
              <label style={{ fontSize: 13, fontWeight: 700 }}>Причина отклонения</label>
              <select className="a-field" style={{ width: '100%' }} value={reason} onChange={(e) => setReason(e.target.value)}>
                <option value="">— выберите причину —</option>
                {REJECT_REASON_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
              {status !== 'ACTIVE' && <button className="abtn abtn-ok" style={{ width: '100%' }} disabled={isActing} onClick={() => act('APPROVE')}><IC.Check size={17} /> Опубликовать</button>}
              {status !== 'REJECTED' && <button className="abtn abtn-danger" style={{ width: '100%' }} disabled={isActing} onClick={() => act('REJECT')}><IC.X size={17} /> Отклонить</button>}
              {status !== 'DRAFT' && <button className="abtn abtn-outline" style={{ width: '100%' }} disabled={isActing} onClick={() => act('SEND_TO_DRAFT')}>В черновики</button>}
              <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
              <button className="abtn abtn-outline" style={{ width: '100%' }} onClick={() => toast('Редактирование объявления')}>Редактировать</button>
              <button className="abtn abtn-outline" style={{ width: '100%' }} onClick={() => toast(listing.promo === 'NORMAL' ? 'Выдать VIP/TOP' : 'Снять продвижение')}>{listing.promo === 'NORMAL' ? 'Продвинуть (VIP/TOP)' : 'Снять продвижение'}</button>
              <button className="abtn abtn-danger" style={{ width: '100%' }} disabled={isActing} onClick={() => act('DELETE')}>Удалить</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
