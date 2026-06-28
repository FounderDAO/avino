/**
 * Детали рассылки (GET /admin/broadcasts/:id через RTK Query).
 * Показывает параметры аудитории, тело сообщения, статистику доставки
 * и кнопку отмены (только для статуса SCHEDULED). Отмена — мутация
 * POST /admin/broadcasts/:id/cancel; инвалидирует тег Admin → детали
 * и список перечитываются автоматически (ADR-0103).
 */
'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { IC } from '@/components/admin/icons';
import { useToast } from '@/components/admin/toast';
import {
  StatusBadge,
  ChannelIcons,
  channelLabels,
  languageLabels,
  audienceLabels,
  userStatusLabels,
  roleLabels,
} from '@/components/admin/broadcast/shared';
import {
  useGetBroadcastQuery,
  useCancelBroadcastMutation,
} from '@/store/api/adminBroadcastsApi';

/** Форматирует ISO-строку в локализованный вид (рус). */
function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('ru-RU');
}

export default function BroadcastDetailPage() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();

  const { data, isLoading, isError } = useGetBroadcastQuery(id);
  const [cancel, { isLoading: isCanceling }] = useCancelBroadcastMutation();

  // ── Состояние загрузки ──────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="a-card" style={{ padding: 40 }}>
        Загрузка…
      </div>
    );
  }

  // ── Состояние ошибки / не найдено ───────────────────────────────────────────
  if (isError || !data) {
    return (
      <div className="a-card" style={{ padding: 40 }}>
        Рассылка не найдена.{' '}
        <Link href="/admin/broadcasts" className="abtn abtn-outline abtn-sm">
          ← К рассылкам
        </Link>
      </div>
    );
  }

  // ── Обработчик отмены рассылки ──────────────────────────────────────────────
  const handleCancel = async () => {
    if (!window.confirm('Отменить рассылку? Это действие необратимо.')) return;
    try {
      await cancel(id).unwrap();
      toast('Рассылка отменена');
    } catch {
      toast('Не удалось отменить рассылку');
    }
  };

  // ── Флаги аудитории ─────────────────────────────────────────────────────────
  const isSegment = data.audience_type === 'SEGMENT';

  // ── Рендер страницы ─────────────────────────────────────────────────────────
  return (
    <div className="fade-up">
      {/* ── Кнопка назад ──────────────────────────────────────────────────── */}
      <Link
        href="/admin/broadcasts"
        className="abtn abtn-outline abtn-sm"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 16 }}
      >
        <IC.ChevronLeft size={16} /> К рассылкам
      </Link>

      {/* ── Шапка: заголовок + бейдж статуса ─────────────────────────────── */}
      <div className="row gap-10" style={{ alignItems: 'center', flexWrap: 'wrap', marginBottom: 20 }}>
        <h2 style={{ fontSize: 22, lineHeight: 1.25, margin: 0 }}>{data.title}</h2>
        <StatusBadge status={data.status} />
        {data.status === 'SENDING' && (
          <span className="muted" style={{ fontSize: 14 }}>Рассылка отправляется…</span>
        )}
      </div>

      <div
        style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20, alignItems: 'start' }}
        className="dash-row"
      >
        {/* ── Левая колонка ───────────────────────────────────────────────── */}
        <div className="col gap-20">
          {/* Карточка «Параметры» */}
          <div className="a-card" style={{ padding: 22 }}>
            <h3 style={{ fontSize: 16, marginBottom: 14 }}>Параметры</h3>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
              {/* Аудитория */}
              <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 13px' }}>
                <div className="muted" style={{ fontSize: 12 }}>Аудитория</div>
                <div style={{ fontWeight: 600, fontSize: 14, marginTop: 2 }}>
                  {audienceLabels[data.audience_type]}
                </div>
              </div>

              {/* Язык (только SEGMENT) */}
              {isSegment && (
                <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 13px' }}>
                  <div className="muted" style={{ fontSize: 12 }}>Язык</div>
                  <div style={{ fontWeight: 600, fontSize: 14, marginTop: 2 }}>
                    {languageLabels[data.language]}
                  </div>
                </div>
              )}

              {/* Статус пользователей (только SEGMENT) */}
              {isSegment && (
                <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 13px' }}>
                  <div className="muted" style={{ fontSize: 12 }}>Статус пользователей</div>
                  <div style={{ fontWeight: 600, fontSize: 14, marginTop: 2 }}>
                    {userStatusLabels[(data.filter_status as keyof typeof userStatusLabels) ?? 'ACTIVE'] ?? data.filter_status ?? 'Активные'}
                  </div>
                </div>
              )}

              {/* Роль (только SEGMENT, если указана) */}
              {isSegment && data.filter_role && (
                <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 13px' }}>
                  <div className="muted" style={{ fontSize: 12 }}>Роль</div>
                  <div style={{ fontWeight: 600, fontSize: 14, marginTop: 2 }}>
                    {roleLabels[data.filter_role] ?? data.filter_role}
                  </div>
                </div>
              )}

              {/* Пользователь (только SINGLE) */}
              {!isSegment && data.target_user_id && (
                <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 13px' }}>
                  <div className="muted" style={{ fontSize: 12 }}>Пользователь</div>
                  <div style={{ fontWeight: 600, fontSize: 14, marginTop: 2, wordBreak: 'break-all' }}>
                    {data.target_user_id}
                  </div>
                </div>
              )}

              {/* Каналы */}
              <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 13px' }}>
                <div className="muted" style={{ fontSize: 12 }}>Каналы</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                  <ChannelIcons channels={data.channels} />
                  <span style={{ fontSize: 13 }}>
                    {data.channels.map((ch) => channelLabels[ch] ?? ch).join(', ')}
                  </span>
                </div>
              </div>

              {/* Размер аудитории */}
              <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 13px' }}>
                <div className="muted" style={{ fontSize: 12 }}>Размер аудитории</div>
                <div style={{ fontWeight: 600, fontSize: 14, marginTop: 2 }}>
                  {data.recipient_count.toLocaleString('en-US')}
                </div>
              </div>

              {/* Создано */}
              <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 13px' }}>
                <div className="muted" style={{ fontSize: 12 }}>Создано</div>
                <div style={{ fontWeight: 600, fontSize: 14, marginTop: 2 }}>
                  {fmtDate(data.created_at)}
                </div>
              </div>

              {/* Запланировано (если есть) */}
              {data.scheduled_at && (
                <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 13px' }}>
                  <div className="muted" style={{ fontSize: 12 }}>Запланировано</div>
                  <div style={{ fontWeight: 600, fontSize: 14, marginTop: 2 }}>
                    {fmtDate(data.scheduled_at)}
                  </div>
                </div>
              )}

              {/* Отправлено (если есть) */}
              {data.sent_at && (
                <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 13px' }}>
                  <div className="muted" style={{ fontSize: 12 }}>Отправлено</div>
                  <div style={{ fontWeight: 600, fontSize: 14, marginTop: 2 }}>
                    {fmtDate(data.sent_at)}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Карточка «Сообщение» */}
          <div className="a-card" style={{ padding: 22 }}>
            <h3 style={{ fontSize: 16, marginBottom: 14 }}>Сообщение</h3>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10 }}>{data.title}</div>
            <div
              style={{
                fontSize: 14.5,
                lineHeight: 1.65,
                color: 'var(--ink-soft)',
                whiteSpace: 'pre-wrap',
              }}
            >
              {data.body}
            </div>
          </div>

          {/* Карточка «Доставка» */}
          <div className="a-card" style={{ padding: 22 }}>
            <h3 style={{ fontSize: 16, marginBottom: 14 }}>Доставка</h3>
            {Object.keys(data.delivery_stats).length === 0 ? (
              <p className="muted" style={{ fontSize: 13.5 }}>
                Доставок пока нет — рассылка ещё не материализована.
              </p>
            ) : (
              <div className="col gap-16">
                {Object.entries(data.delivery_stats).map(([channel, stats]) => (
                  <div key={channel}>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: 'var(--ink)' }}>
                      {channelLabels[channel as keyof typeof channelLabels] ?? channel}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {Object.entries(stats).map(([statusKey, count]) => (
                        <div
                          key={statusKey}
                          style={{
                            background: 'var(--surface-2)',
                            border: '1px solid var(--border)',
                            borderRadius: 8,
                            padding: '6px 12px',
                            fontSize: 13,
                          }}
                        >
                          <span className="muted">{statusKey}:</span>{' '}
                          <span style={{ fontWeight: 600 }}>
                            {count.toLocaleString('en-US')}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Правая колонка: действия ──────────────────────────────────────── */}
        <div className="col gap-16">
          <div className="a-card" style={{ padding: 20 }}>
            <h3 style={{ fontSize: 15, marginBottom: 14 }}>Действия</h3>
            <div className="col gap-10">
              {data.status === 'SCHEDULED' && (
                <button
                  className="abtn abtn-danger"
                  style={{ width: '100%' }}
                  disabled={isCanceling}
                  onClick={handleCancel}
                >
                  {isCanceling ? 'Отмена…' : 'Отменить рассылку'}
                </button>
              )}
              {data.status !== 'SCHEDULED' && (
                <p className="muted" style={{ fontSize: 13, textAlign: 'center' }}>
                  Рассылка не может быть отменена в статусе «{data.status}».
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
