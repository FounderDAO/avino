'use client';

/**
 * Экран «Модерация» — очередь объявлений на проверку (`GET /admin/listings?
 * status=NEW`, серверная пагинация) + карточка с действиями модерации
 * (`PATCH /admin/listings/:id/status`). Вёрстка 1:1 с прототипом; источник
 * данных — RTK Query через адаптер `rowToModerationItem`.
 *
 * Карточка обогащена двумя блоками (TASK-220):
 *  - «Создатель объявления» — инлайн-профиль автора (`owner`, ADR-0084): имя,
 *    контакт, роли, статус аккаунта, дата регистрации. Берётся из строки списка,
 *    доступен и MODERATOR (без ADMIN-only `GET /admin/users/:id`). `owner`
 *    optional — старый бэкенд его не отдаёт, блок просто не рендерится.
 *  - «Об объявлении» — реальные фото/площадь/комнаты/этаж/год/адрес/описание,
 *    лениво подгружаемые из `GET /listings/:id` для выбранного объявления
 *    (список их не отдаёт — там было «—»).
 */
import { useEffect, useState } from 'react';
import { SectionTitle } from '@/components/admin/ui/section-title';
import { StatusPill } from '@/components/admin/ui/pill';
import { IC } from '@/components/admin/icons';
import { useToast } from '@/components/admin/toast';
import { TranslationRow } from '@/components/admin/TranslationRow';
import {
  useGetAdminListingQuery,
  useListAdminListingsQuery,
  useModerateListingMutation,
  useGetListingTranslationsQuery,
  useGenerateTranslationsMutation,
  useUpdateTranslationMutation,
} from '@/store/api/adminListingsApi';
import { totalPages } from '@/store/api/adminApi';
import { getApiError, getApiErrorCode } from '@/store/api/apiError';
import { detailToAdminListing, rowToModerationItem } from '@/lib/adapters/listings';
import { ROLE_LABEL } from '@/lib/adapters/users';
import type { UserStatus } from '@/store/api/authApi';
import type {
  AdminListingOwner,
  ModerationAction,
  RoleCode,
} from '@/store/api/adminTypes';

const LIMIT = 20;
const DASH = '—';
/** Языки, обязательные перед одобрением (APPROVE гейтится бэкендом и UI). */
const REQUIRED_LANGS = ['UZ', 'RU', 'EN'] as const;

/** Дата без времени (ru-RU) — для даты регистрации автора. */
const dateFmt = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});
/** Дата + время (ru-RU) — для «создано/опубликовано». */
const dateTimeFmt = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

function fmtDate(iso: string | null | undefined, withTime = false): string {
  if (!iso) return DASH;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return DASH;
  return (withTime ? dateTimeFmt : dateFmt).format(d);
}

/** Отображаемое имя автора: display_name → first+last → email/phone → ID. */
function ownerName(o: AdminListingOwner): string {
  const display = o.display_name?.trim();
  if (display) return display;
  const full = [o.first_name, o.last_name]
    .map((s) => s?.trim())
    .filter(Boolean)
    .join(' ')
    .trim();
  return full || o.email || o.phone || `ID ${o.id.slice(0, 8)}`;
}

/** Инициалы для аватара-плейсхолдера (1–2 буквы). */
function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

const USER_STATUS_LABEL: Record<UserStatus, string> = {
  ACTIVE: 'Активен',
  BLOCKED: 'Заблокирован',
  DELETED: 'Удалён',
};

/** Метка роли по коду (fallback — сам код). */
function roleLabel(code: RoleCode): string {
  return ROLE_LABEL[code] ?? code;
}

/** Человекочитаемый текст ошибки модерации (RU) по коду/статусу API. */
function moderationErrorMessage(error: unknown): string {
  const e = error as { status?: number } | undefined;
  const code = getApiErrorCode(error as never);
  const status = e?.status;
  const msg = getApiError(error as never)?.message ?? '';
  if (status === 422 && msg.includes('Translations required')) {
    return 'Сначала сгенерируйте переводы на все языки';
  }
  if (status === 422 || code === 'INVALID_STATUS_TRANSITION') {
    return 'Недопустимый переход статуса для этого объявления.';
  }
  if (status === 403) return 'Недостаточно прав для этого действия.';
  if (status === 404) return 'Объявление не найдено.';
  return getApiError(error as never)?.message ?? 'Не удалось выполнить действие.';
}

/** Блок «Создатель объявления» — инлайн-профиль автора (ADR-0084). */
function CreatorCard({ owner }: { owner: AdminListingOwner }) {
  const name = ownerName(owner);
  const isActive = owner.status === 'ACTIVE';
  return (
    <div style={{ marginTop: 18, paddingTop: 18, borderTop: '1px solid var(--border)' }}>
      <h3 style={{ fontSize: 15, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
        <IC.User size={17} /> Создатель объявления
      </h3>
      <div className="row gap-12" style={{ alignItems: 'flex-start' }}>
        <div style={{ width: 46, height: 46, borderRadius: '50%', flexShrink: 0, background: 'var(--surface-2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 15, color: 'var(--ink-soft)' }}>
          {initials(name)}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 15.5 }}>{name}</div>
          <div className="row wrap gap-6" style={{ marginTop: 6 }}>
            {owner.roles.map((r) => (
              <span key={r} className="a-pill" style={{ background: 'var(--mint)', color: 'var(--teal-deep)' }}>{roleLabel(r)}</span>
            ))}
            <span className="a-pill" style={{ background: isActive ? 'var(--green-bg)' : 'var(--red-bg)', color: isActive ? 'var(--green)' : 'var(--red)' }}>
              {USER_STATUS_LABEL[owner.status] ?? owner.status}
            </span>
          </div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10, marginTop: 14 }}>
        {([
          ['Телефон', owner.phone ?? owner.contact_phone ?? DASH, IC.Phone],
          ['Email', owner.email ?? DASH, IC.Mail],
          ['Регистрация', fmtDate(owner.created_at), IC.Calendar],
          ['ID пользователя', owner.id.slice(0, 8), IC.User],
        ] as [string, string, typeof IC.User][]).map(([k, v, Icon]) => (
          <div key={k} style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 13px' }}>
            <div className="muted row gap-6" style={{ fontSize: 12, alignItems: 'center' }}><Icon size={13} /> {k}</div>
            <div style={{ fontWeight: 600, fontSize: 13.5, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v}</div>
          </div>
        ))}
      </div>
    </div>
  );
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
  // Сырая строка списка нужна ради `owner` и точных таймстемпов (created/published).
  const selRow = (data?.data ?? []).find((r) => r.id === selId) ?? null;

  // Ленивая подгрузка полной детали выбранного объявления (фото/площадь/этаж/…).
  const { data: detail, isFetching: detailFetching } = useGetAdminListingQuery(
    selId ?? '',
    { skip: !selId },
  );
  const detailModel = detail ? detailToAdminListing(detail) : null;
  const full = detailModel?.priceRaw ?? null;
  const photos = full?.photos ?? [];

  // Переводы выбранного объявления — генерация/ревью/правка прямо в очереди
  // модерации. Эндпоинты те же, что и на детальной карточке `/admin/listings/:id`.
  const { data: tr } = useGetListingTranslationsQuery(selId ?? '', { skip: !selId });
  const [generate, { isLoading: isGenerating }] = useGenerateTranslationsMutation();
  const [saveTr, { isLoading: isSavingTr }] = useUpdateTranslationMutation();
  const presentLangs = new Set((tr?.translations ?? []).map((t) => t.language));
  // APPROVE недоступен пока нет всех языков (дублирует серверный гейт 422).
  const translationsComplete = REQUIRED_LANGS.every((l) => presentLangs.has(l));

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
                  <div style={{ minWidth: 0 }}><div style={{ fontWeight: 600, fontSize: 13.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{m.address ?? m.tx}</div>{m.address && <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{m.tx}</div>}<StatusPill status="PENDING" /></div>
                </button>
              ))}
            </div>
            {sel && (
              <div className="a-card" style={{ padding: 22 }}>
                {photos.length > 0 ? (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
                    {photos.slice(0, 4).map((p, i) => (
                      <div key={i} style={{ aspectRatio: '4/3', borderRadius: 10, overflow: 'hidden' }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={p.thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      </div>
                    ))}
                  </div>
                ) : detailFetching ? (
                  <div className="muted" style={{ fontSize: 13, marginBottom: 12 }}>Загрузка деталей…</div>
                ) : null}
                <h2 style={{ fontSize: 22 }}>{full?.address ?? sel.address ?? DASH}</h2>
                <div style={{ fontSize: 22, fontWeight: 800, marginTop: 6 }}>{detailModel?.price ?? sel.price}</div>
                <div className="row gap-12 muted" style={{ fontSize: 14, marginTop: 8, flexWrap: 'wrap' }}>
                  <span>{detailModel?.type ?? sel.type}</span>
                  <span>·</span><span>{detailModel?.rooms ?? sel.rooms} комн</span>
                  <span>·</span><span>{full?.area ?? DASH} м²</span>
                  <span>·</span><span>{detailModel?.tx ?? sel.tx}</span>
                </div>
                {full?.desc && <p style={{ fontSize: 14.5, lineHeight: 1.6, marginTop: 12, color: 'var(--ink-soft)' }}>{full.desc}</p>}
                {full && full.features.length > 0 && (
                  <div className="row wrap gap-8" style={{ marginTop: 12 }}>
                    {full.features.map((f) => <span key={f} className="a-pill" style={{ background: 'var(--surface-2)', color: 'var(--ink)', border: '1px solid var(--border)' }}>{f}</span>)}
                  </div>
                )}

                {selRow?.owner && <CreatorCard owner={selRow.owner} />}

                <div style={{ marginTop: 18, paddingTop: 18, borderTop: '1px solid var(--border)' }}>
                  <h3 style={{ fontSize: 15, marginBottom: 12 }}>Об объявлении</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10 }}>
                    {([
                      ['Создано', fmtDate(selRow?.created_at, true)],
                      ['Опубликовано', selRow?.published_at ? fmtDate(selRow.published_at, true) : 'ещё не опубликовано'],
                      ['Адрес', full?.address ?? DASH],
                      ['Этаж', full?.floor ? `${full.floor}/${full.totalFloors ?? DASH}` : DASH],
                      ['Год постройки', full?.year ? String(full.year) : DASH],
                      ['ID объявления', sel.id.slice(0, 8)],
                    ] as [string, string][]).map(([k, v]) => (
                      <div key={k} style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 13px' }}>
                        <div className="muted" style={{ fontSize: 12 }}>{k}</div>
                        <div style={{ fontWeight: 600, fontSize: 13.5, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ marginTop: 18, paddingTop: 18, borderTop: '1px solid var(--border)' }}>
                  <div className="row" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
                    <h3 style={{ fontSize: 15 }}>Переводы</h3>
                    <button
                      className="abtn abtn-outline abtn-sm"
                      disabled={isGenerating}
                      onClick={async () => {
                        try { await generate(sel.id).unwrap(); toast('Переводы сгенерированы'); }
                        catch { toast('Не удалось сгенерировать переводы'); }
                      }}
                    >
                      {isGenerating ? 'Генерация…' : 'Сгенерировать переводы'}
                    </button>
                  </div>
                  {(tr?.translations ?? []).map((t) => (
                    <TranslationRow
                      key={t.language}
                      item={t}
                      saving={isSavingTr}
                      original={t.language === tr?.original_language}
                      onSave={async (body) => {
                        try { await saveTr({ id: sel.id, language: t.language, body }).unwrap(); toast('Перевод сохранён'); }
                        catch { toast('Не удалось сохранить'); }
                      }}
                    />
                  ))}
                  {!tr?.translations?.length && (
                    <p className="muted" style={{ fontSize: 13.5 }}>
                      Переводов пока нет — нажмите «Сгенерировать переводы».
                    </p>
                  )}
                </div>

                <div style={{ marginTop: 18, paddingTop: 18, borderTop: '1px solid var(--border)' }}>
                  <label style={{ fontSize: 13, fontWeight: 700, display: 'block', marginBottom: 7 }}>Причина отклонения (если отклоняете)</label>
                  <select className="a-field" style={{ width: '100%', marginBottom: 14 }} value={reason} onChange={(e) => setReason(e.target.value)}>
                    <option value="">— выберите причину —</option>
                    {sel.reasonOptions.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                  <div className="row gap-10">
                    <button className="abtn abtn-ok" style={{ flex: 1 }} disabled={isActing || !translationsComplete} title={translationsComplete ? undefined : 'Сначала сгенерируйте переводы на все языки'} onClick={() => act(sel.id, 'APPROVE')}><IC.Check size={18} /> Одобрить</button>
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
