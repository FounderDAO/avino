'use client';

/**
 * Экран «Модерация» — очередь объявлений на проверку (`GET /admin/listings?
 * status=NEW`, серверная пагинация) + карточка с действиями модерации
 * (`PATCH /admin/listings/:id/status`). Вёрстка 1:1 с прототипом; источник
 * данных — RTK Query через адаптер `rowToModerationItem`.
 *
 * Список не отдаёт фото/площадь/комнаты/район/описание — они приходят только в
 * `ListingDetail`, поэтому в карточке здесь это пусто/«—». Действия инвалидируют
 * тег `Admin`, очередь и счётчик перечитываются сами.
 */
import { useEffect, useState } from 'react';
import { SectionTitle } from '@/components/admin/ui/section-title';
import { StatusPill } from '@/components/admin/ui/pill';
import { IC } from '@/components/admin/icons';
import { useToast } from '@/components/admin/toast';
import {
  useListAdminListingsQuery,
  useModerateListingMutation,
} from '@/store/api/adminListingsApi';
import { totalPages } from '@/store/api/adminApi';
import { getApiError, getApiErrorCode } from '@/store/api/apiError';
import { rowToModerationItem } from '@/lib/adapters/listings';
import type { ModerationAction } from '@/store/api/adminTypes';

const LIMIT = 20;

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

export default function ModerationPage() {
  const toast = useToast();
  const [page, setPage] = useState<number>(1);
  const [selId, setSelId] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  const { data, isLoading, isFetching, isError, refetch } =
    useListAdminListingsQuery({ status: 'NEW', page, limit: LIMIT });

  const [moderate, { isLoading: isActing }] = useModerateListingMutation();

  const queue = (data?.data ?? []).map(rowToModerationItem);
  const total = data?.meta.total ?? 0;
  const pages = totalPages(data?.meta);

  // Держим валидное выделение при смене страницы/обновлении очереди.
  useEffect(() => {
    if (queue.length === 0) {
      setSelId(null);
      return;
    }
    if (!selId || !queue.some((m) => m.id === selId)) {
      setSelId(queue[0].id);
    }
  }, [queue, selId]);

  const sel = queue.find((m) => m.id === selId) ?? null;

  const act = async (id: string, action: ModerationAction) => {
    if (action === 'REJECT' && !reason) {
      toast('Выберите причину отклонения');
      return;
    }
    try {
      await moderate({
        id,
        body: { action, reason: action === 'REJECT' ? reason : undefined },
      }).unwrap();
      if (action === 'APPROVE') toast('Объявление одобрено и опубликовано');
      else if (action === 'SEND_TO_DRAFT') toast('Возвращено в черновики');
      else if (action === 'REJECT') toast('Объявление отклонено');
      else if (action === 'DELETE') toast('Объявление удалено');
      setReason('');
    } catch (err) {
      toast(moderationErrorMessage(err));
    }
  };

  return (
    <div>
      <SectionTitle sub={`${total} объявлений ждут проверки`}>Модерация</SectionTitle>
      {isError ? (
        <div className="a-card" style={{ padding: 40, textAlign: 'center' }}>
          <p className="muted" style={{ marginBottom: 14 }}>Не удалось загрузить очередь модерации.</p>
          <button className="abtn abtn-outline" onClick={() => refetch()}>Повторить</button>
        </div>
      ) : isLoading ? (
        <div className="a-card" style={{ padding: 60, textAlign: 'center' }}>
          <p className="muted">Загрузка…</p>
        </div>
      ) : queue.length === 0 ? (
        <div className="a-card" style={{ padding: 60, textAlign: 'center' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--green-bg)', color: 'var(--green)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}><IC.Check size={32} strokeWidth={2.4} /></div>
          <h3 style={{ fontSize: 20 }}>Очередь пуста</h3><p className="muted" style={{ marginTop: 4 }}>Все объявления проверены. Отличная работа!</p>
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 18, alignItems: 'start' }} className="mod-grid">
            <div className="a-card" style={{ overflow: 'hidden' }}>
              {queue.map((m) => (
                <button key={m.id} onClick={() => setSelId(m.id)} style={{ display: 'flex', gap: 12, width: '100%', padding: 12, border: 'none', borderBottom: '1px solid var(--border)', background: sel && sel.id === m.id ? 'var(--surface-2)' : 'transparent', textAlign: 'left', cursor: 'pointer' }}>
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
                {sel.full.photos.length > 0 && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
                    {sel.full.photos.slice(0, 4).map((p, i) => (
                      <div key={i} style={{ aspectRatio: '4/3', borderRadius: 10, overflow: 'hidden' }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={p.thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      </div>
                    ))}
                  </div>
                )}
                <h2 style={{ fontSize: 22 }}>{sel.title}</h2>
                <div style={{ fontSize: 22, fontWeight: 800, marginTop: 6 }}>{sel.price}</div>
                <div className="row gap-12 muted" style={{ fontSize: 14, marginTop: 8, flexWrap: 'wrap' }}>
                  <span>{sel.type}</span><span>·</span><span>{sel.rooms} комн</span><span>·</span><span>{sel.district}</span><span>·</span><span>{sel.agent}</span>
                </div>
                {sel.full.desc && <p style={{ fontSize: 14.5, lineHeight: 1.6, marginTop: 12, color: 'var(--ink-soft)' }}>{sel.full.desc}</p>}
                <div style={{ marginTop: 18, paddingTop: 18, borderTop: '1px solid var(--border)' }}>
                  <label style={{ fontSize: 13, fontWeight: 700, display: 'block', marginBottom: 7 }}>Причина отклонения (если отклоняете)</label>
                  <select className="a-field" style={{ width: '100%', marginBottom: 14 }} value={reason} onChange={(e) => setReason(e.target.value)}>
                    <option value="">— выберите причину —</option>
                    {sel.reasonOptions.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                  <div className="row gap-10">
                    <button className="abtn abtn-ok" style={{ flex: 1 }} disabled={isActing} onClick={() => act(sel.id, 'APPROVE')}><IC.Check size={18} /> Одобрить</button>
                    <button className="abtn abtn-danger" style={{ flex: 1 }} disabled={isActing} onClick={() => act(sel.id, 'REJECT')}><IC.X size={18} /> Отклонить</button>
                  </div>
                  <div className="row gap-10" style={{ marginTop: 10 }}>
                    <button className="abtn abtn-outline" style={{ flex: 1 }} disabled={isActing} onClick={() => act(sel.id, 'SEND_TO_DRAFT')}>В черновики</button>
                    <button className="abtn abtn-outline" style={{ flex: 1 }} disabled={isActing} onClick={() => act(sel.id, 'DELETE')}>Удалить</button>
                  </div>
                </div>
              </div>
            )}
          </div>
          {pages > 1 && (
            <div className="row" style={{ justifyContent: 'space-between', marginTop: 14, fontSize: 13.5, color: 'var(--muted)' }}>
              <span>{isFetching ? 'Обновление…' : `Показано ${queue.length} из ${total}`}</span>
              <div className="row gap-4">
                <button className="aicon-btn" style={{ width: 32, height: 32 }} disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}><IC.ChevronLeft size={16} /></button>
                <button className="abtn abtn-sm" style={{ background: 'var(--ink)', color: '#fff' }}>{page}</button>
                <button className="aicon-btn" style={{ width: 32, height: 32 }} disabled={page >= pages} onClick={() => setPage((p) => p + 1)}><IC.ChevronRight size={16} /></button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
