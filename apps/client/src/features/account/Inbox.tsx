/**
 * Inbox — вкладка «Сообщения» (auth-aware, серверный чат, docs/API.md §13).
 *
 * Два пейна: слева список диалогов (GET /chat/threads, polling 10s) с именем
 * собеседника и превью последней реплики; справа переписка выбранного диалога
 * (GET /chat/threads/:id/messages, polling 6s) — лента ASC (старые сверху),
 * разделители по дням, группировка реплик, статусы прочтения, оптимистичная
 * отправка, подгрузка истории и автоскролл к свежим. Отправка — POST .../messages
 * (оптимистично, см. chatApi); открытие диалога с непрочитанными — POST .../read.
 *
 * Мобильный: один пейн на экран (список ↔ переписка) с кнопкой «назад».
 * Гость: ручки защищены (401) — показываем подсказку войти, запросы skip-аются.
 */
'use client';

import * as React from 'react';
import { Link } from '@/i18n/navigation';
import {
  Check,
  CheckCheck,
  ChevronLeft,
  Clock,
  MessageCircle,
  Send,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { fieldClass } from '@/components/ui/field';
import { PhotoImg } from '@/components/ui/photo-img';
import { useFormatter, useTranslations } from 'next-intl';
import { formatMoney, type T } from '@/lib/format';
import { useAppSelector } from '@/store/hooks';
import { selectCurrentUser, selectIsAuthenticated } from '@/store/slices/authSlice';
import { selectSocketConnected } from '@/store/realtimeSlice';
import { effectivePollingInterval } from '@/store/useUnreadCounts';
import { getApiError } from '@/store/api/apiError';
import {
  useGetThreadsQuery,
  useGetThreadMessagesQuery,
  useLazyGetThreadMessagesQuery,
  useSendMessageMutation,
  useMarkThreadReadMutation,
  type ApiThread,
} from '@/store/api/chatApi';
import {
  buildMessageRows,
  lastMessagePreview,
  localDayKey,
  mergeMessages,
  type ChatMessage,
} from './chat-utils';

/** Имя собеседника для заголовка/списка: профиль → заголовок объявления → «#». */
function threadTitle(t: ApiThread): string {
  return t.counterparty?.name?.trim() || t.listing_preview?.title?.trim() || '—';
}

/** Аватар-инициал из имени собеседника (фолбэк — «#»). */
function avatarInitial(t: ApiThread): string {
  return threadTitle(t).trim()[0]?.toUpperCase() ?? '#';
}

/**
 * Аватар диалога — фото объекта (`listing_preview.thumbnail_url`), чтобы при
 * нескольких объявлениях у одного собеседника диалоги различались визуально
 * (spec 2026-07-02-chat-thread-listing-context). Фолбэк (нет превью или фото) —
 * прежний круг с инициалом собеседника. `className` задаёт размеры (h-* w-*).
 */
function ThreadAvatar({
  thread,
  className,
}: {
  thread: ApiThread;
  className: string;
}) {
  const src = thread.listing_preview?.thumbnail_url;
  if (src) {
    return (
      <span
        className={cn(
          'relative shrink-0 overflow-hidden rounded-[10px]',
          className,
        )}
      >
        {/* h-full w-full: в fill-режиме безвредно, а error-плейсхолдер PhotoImg
            (глиф ~49px) без размеров клиппится в 40-44px контейнере вкривь. */}
        <PhotoImg src={src} sizes="48px" className="h-full w-full" />
      </span>
    );
  }
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full bg-mint text-[16px] font-extrabold text-teal-deep',
        className,
      )}
    >
      {avatarInitial(thread)}
    </span>
  );
}

/** Вторичная часть строки объявления (список и шапка): цена либо статус. */
function listingSubtitle(t: ApiThread, tUnits: T): string {
  const p = t.listing_preview;
  if (!p) return '';
  const n = Number(p.price);
  if (Number.isFinite(n) && n > 0) {
    return formatMoney(p.price, p.currency === 'USD' ? 'USD' : 'UZS', tUnits);
  }
  return p.status;
}

/** Время сообщения «12:40» (локальное). */
function msgTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

/** Порог «пользователь у нижнего края» — при нём автоскроллим к новым. */
const NEAR_BOTTOM_PX = 120;

/** SSR-safe layout effect: на сервере деградирует до useEffect (без warning). */
const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? React.useLayoutEffect : React.useEffect;

export function Inbox() {
  const format = useFormatter();
  const tUnits = useTranslations('units');
  const tAccount = useTranslations('account');
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const currentUser = useAppSelector(selectCurrentUser);
  const currentUserId = currentUser?.id ?? null;
  const socketLive = useAppSelector(selectSocketConnected);

  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [text, setText] = React.useState('');
  const [sendError, setSendError] = React.useState<string | null>(null);

  // История (подгруженные старые страницы) + курсор следующей старой страницы.
  const [loadedOlder, setLoadedOlder] = React.useState<ChatMessage[]>([]);
  const [nextOlderCursor, setNextOlderCursor] = React.useState<string | null>(
    null,
  );

  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const taRef = React.useRef<HTMLTextAreaElement | null>(null);
  const nearBottomRef = React.useRef(true);
  const lastIdRef = React.useRef<string | null>(null);
  const markedRef = React.useRef<string | null>(null);

  // Десктоп ≥640px: только там автовыбираем первый диалог (на мобильном — по тапу).
  const [isDesktop, setIsDesktop] = React.useState(false);
  React.useEffect(() => {
    const mq = window.matchMedia('(min-width: 640px)');
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  const { data: threads, isLoading: threadsLoading } = useGetThreadsQuery(
    undefined,
    {
      skip: !isAuthenticated,
      pollingInterval: effectivePollingInterval(10000, socketLive),
    },
  );

  React.useEffect(() => {
    if (isDesktop && selectedId == null && threads && threads.length > 0) {
      setSelectedId(threads[0].id);
    }
  }, [isDesktop, threads, selectedId]);

  const selectedThread = threads?.find((t) => t.id === selectedId) ?? null;

  const { data: messagesData, isLoading: messagesLoading } =
    useGetThreadMessagesQuery(
      { threadId: selectedId ?? '' },
      {
        skip: !isAuthenticated || selectedId == null,
        pollingInterval: effectivePollingInterval(6000, socketLive),
      },
    );

  const [fetchOlder, { isFetching: olderFetching }] =
    useLazyGetThreadMessagesQuery();
  const [markRead] = useMarkThreadReadMutation();
  const [sendMessage, { isLoading: isSending }] = useSendMessageMutation();

  // Объединённая ASC-лента: история + свежая страница (с дедупом/сортировкой).
  const merged = React.useMemo(
    () => mergeMessages(loadedOlder, messagesData?.items ?? []),
    [loadedOlder, messagesData],
  );
  const rows = React.useMemo(
    () => buildMessageRows(merged, currentUserId),
    [merged, currentUserId],
  );

  // Курсор «показать ранние»: до первой подгрузки — из свежей страницы, далее —
  // из последней подгруженной.
  const moreOlderCursor =
    loadedOlder.length === 0
      ? (messagesData?.olderCursor ?? null)
      : nextOlderCursor;

  // Сброс состояния переписки при смене диалога.
  React.useEffect(() => {
    setLoadedOlder([]);
    setNextOlderCursor(null);
    setSendError(null);
    lastIdRef.current = null;
    nearBottomRef.current = true;
    markedRef.current = null;
  }, [selectedId]);

  // Пометить диалог прочитанным один раз на «состояние непрочитанности».
  React.useEffect(() => {
    if (selectedId == null) return;
    const hasUnreadThread = (selectedThread?.unread_count ?? 0) > 0;
    const hasUnreadIncoming = (messagesData?.items ?? []).some(
      (m) => !m.is_read && m.sender_id !== currentUserId,
    );
    const key = `${selectedId}:${selectedThread?.unread_count ?? 0}`;
    if ((hasUnreadThread || hasUnreadIncoming) && markedRef.current !== key) {
      markedRef.current = key;
      void markRead(selectedId);
    }
  }, [selectedId, selectedThread, messagesData, currentUserId, markRead]);

  // Автоскролл к низу: при открытии диалога (мгновенно), при своей реплике и при
  // входящей, когда пользователь у нижнего края (иначе не дёргаем чтение истории).
  useIsomorphicLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const last = merged[merged.length - 1];
    if (!last) return;
    if (lastIdRef.current === last.id) return;
    const initial = lastIdRef.current === null;
    lastIdRef.current = last.id;
    const mineLast = last.sender_id === currentUserId;
    if (initial || mineLast || nearBottomRef.current) {
      if (initial) el.scrollTop = el.scrollHeight;
      else el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    }
  }, [merged, currentUserId]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    nearBottomRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
  };

  const onLoadOlder = async () => {
    if (selectedId == null || !moreOlderCursor || olderFetching) return;
    const el = scrollRef.current;
    const prevHeight = el?.scrollHeight ?? 0;
    const prevTop = el?.scrollTop ?? 0;
    try {
      const page = await fetchOlder({
        threadId: selectedId,
        cursor: moreOlderCursor,
      }).unwrap();
      setLoadedOlder((prev) => mergeMessages(page.items, prev));
      setNextOlderCursor(page.olderCursor);
      // Сохранить позицию: контент вырос сверху — компенсируем прирост высоты.
      requestAnimationFrame(() => {
        const el2 = scrollRef.current;
        if (el2) el2.scrollTop = el2.scrollHeight - prevHeight + prevTop;
      });
    } catch {
      /* молча: кнопка останется, можно повторить */
    }
  };

  const autoGrow = () => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  };

  const openThread = (id: string) => setSelectedId(id);

  const send = () => {
    const body = text.trim();
    if (!body || selectedId == null || isSending) return;
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setText('');
    setSendError(null);
    nearBottomRef.current = true;
    requestAnimationFrame(autoGrow);
    sendMessage({ threadId: selectedId, body, tempId, senderId: currentUserId })
      .unwrap()
      .catch((err) => {
        const apiErr = getApiError(err as Parameters<typeof getApiError>[0]);
        setSendError(apiErr?.message ?? tAccount('inbox.sendError'));
        setText((cur) => (cur ? cur : body)); // вернуть текст для повторной отправки
      });
  };

  const dayLabel = React.useCallback(
    (iso: string): string => {
      const key = localDayKey(iso);
      const today = localDayKey(new Date().toISOString());
      const yesterday = localDayKey(
        new Date(Date.now() - 86_400_000).toISOString(),
      );
      if (key === today) return tAccount('inbox.today');
      if (key === yesterday) return tAccount('inbox.yesterday');
      return format.dateTime(new Date(iso), {
        day: 'numeric',
        month: 'long',
      });
    },
    [format, tAccount],
  );

  // ─── Гость ────────────────────────────────────────────────────────────────
  if (!isAuthenticated) {
    return (
      <div>
        <h1 className="mb-[18px] text-[28px]">{tAccount('inbox.title')}</h1>
        <EmptyState
          icon={MessageCircle}
          title={tAccount('inbox.authTitle')}
          text={tAccount('inbox.authText')}
          action={
            <Button asChild>
              <Link href="/">{tAccount('inbox.goHome')}</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const list = threads ?? [];

  return (
    <div>
      <h1 className="mb-[18px] text-[28px]">{tAccount('inbox.title')}</h1>
      <div className="grid h-[calc(100dvh-180px)] max-h-[760px] min-h-[460px] grid-cols-1 overflow-hidden rounded-card border border-border/60 bg-surface shadow-card sm:grid-cols-[320px_1fr]">
        {/* Список диалогов */}
        <div
          className={cn(
            'min-h-0 flex-col overflow-y-auto border-border sm:flex sm:border-r',
            selectedId ? 'hidden sm:flex' : 'flex',
          )}
        >
          {threadsLoading ? (
            <div className="flex flex-col gap-2 p-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-[78px] rounded-card" />
              ))}
            </div>
          ) : list.length === 0 ? (
            <EmptyState
              icon={MessageCircle}
              title={tAccount('inbox.emptyList')}
              className="py-10"
            />
          ) : (
            list.map((t) => {
              const preview =
                lastMessagePreview(
                  t.last_message,
                  currentUserId,
                  tAccount('inbox.you'),
                ) ?? '';
              return (
                <button
                  key={t.id}
                  onClick={() => openThread(t.id)}
                  className={cn(
                    'flex w-full items-center gap-3 border-b border-border/70 px-4 py-3.5 text-left transition-colors',
                    selectedId === t.id
                      ? 'bg-surface-2'
                      : 'bg-transparent hover:bg-surface-2',
                  )}
                >
                  <ThreadAvatar thread={t} className="h-11 w-11" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <b className="truncate text-[14.5px]">{threadTitle(t)}</b>
                      {t.last_message_at && (
                        <span className="shrink-0 whitespace-nowrap text-[11px] text-muted-foreground">
                          {format.relativeTime(new Date(t.last_message_at))}
                        </span>
                      )}
                    </span>
                    {t.listing_preview && (
                      <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">
                        {t.listing_preview.title} · {listingSubtitle(t, tUnits)}
                      </span>
                    )}
                    <span className="mt-0.5 flex items-center gap-2">
                      <span
                        className={cn(
                          'min-w-0 flex-1 truncate text-[12.5px]',
                          t.unread_count > 0
                            ? 'font-semibold text-ink'
                            : 'text-muted-foreground',
                        )}
                      >
                        {preview}
                      </span>
                      {t.unread_count > 0 && (
                        <span className="flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-pill bg-red px-1.5 text-[11px] font-extrabold text-white">
                          {t.unread_count}
                        </span>
                      )}
                    </span>
                  </span>
                </button>
              );
            })
          )}
        </div>

        {/* Окно переписки */}
        <div
          className={cn(
            'min-h-0 min-w-0 flex-col',
            selectedId ? 'flex' : 'hidden sm:flex',
          )}
        >
          {selectedThread ? (
            <>
              {/* Шапка диалога */}
              <div className="flex shrink-0 items-center gap-3 border-b border-border px-3 py-3 sm:px-[18px]">
                <button
                  type="button"
                  onClick={() => setSelectedId(null)}
                  aria-label={tAccount('inbox.back')}
                  className="-ml-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink hover:bg-surface-2 sm:hidden"
                >
                  <ChevronLeft size={22} />
                </button>
                <ThreadAvatar thread={selectedThread} className="h-10 w-10" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-bold">
                    {threadTitle(selectedThread)}
                  </div>
                  {selectedThread.listing_preview && (
                    <Link
                      href={`/listing/${selectedThread.listing_id}`}
                      className="block truncate text-[12.5px] text-muted-foreground hover:text-teal"
                    >
                      {selectedThread.listing_preview.title} ·{' '}
                      {listingSubtitle(selectedThread, tUnits)}
                    </Link>
                  )}
                </div>
              </div>

              {/* Лента сообщений */}
              <div
                ref={scrollRef}
                onScroll={onScroll}
                className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-surface-2 px-3 py-3 sm:px-[18px]"
              >
                {messagesLoading && merged.length === 0 ? (
                  <div className="flex flex-col gap-2">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Skeleton
                        key={i}
                        className={cn(
                          'h-9 rounded-[16px]',
                          i % 2 === 0 ? 'w-[58%] self-start' : 'w-[48%] self-end',
                        )}
                      />
                    ))}
                  </div>
                ) : merged.length === 0 ? (
                  <div className="flex flex-1 items-center justify-center px-6 text-center text-[13.5px] text-muted-foreground">
                    {tAccount('inbox.emptyThread')}
                  </div>
                ) : (
                  <>
                    {moreOlderCursor && (
                      <div className="flex justify-center pb-2">
                        <button
                          type="button"
                          onClick={() => void onLoadOlder()}
                          disabled={olderFetching}
                          className="rounded-pill border border-border bg-surface px-3.5 py-1 text-[12px] font-semibold text-teal transition-colors hover:text-teal-deep disabled:opacity-50"
                        >
                          {olderFetching ? '…' : tAccount('inbox.loadOlder')}
                        </button>
                      </div>
                    )}
                    {rows.map((row) =>
                      row.kind === 'day' ? (
                        <div
                          key={row.key}
                          className="my-2 flex justify-center"
                        >
                          <span className="rounded-pill bg-surface px-3 py-1 text-[11px] font-semibold text-muted-foreground shadow-sm">
                            {dayLabel(row.iso)}
                          </span>
                        </div>
                      ) : (
                        <div
                          key={row.key}
                          className={cn(
                            'flex',
                            row.mine ? 'justify-end' : 'justify-start',
                            row.grouped ? 'mt-0.5' : 'mt-3',
                          )}
                        >
                          <div
                            className={cn(
                              'max-w-[80%] rounded-[16px] px-3.5 py-2 text-[14.5px] leading-snug sm:max-w-[72%]',
                              row.mine
                                ? 'rounded-br-[5px] bg-red text-white'
                                : 'rounded-bl-[5px] border border-border bg-surface text-ink',
                              row.message.pending === 'sending' && 'opacity-80',
                            )}
                          >
                            <span className="whitespace-pre-wrap break-words">
                              {row.message.body}
                            </span>
                            <span
                              className={cn(
                                'mt-0.5 flex items-center justify-end gap-1 text-[10.5px]',
                                row.mine
                                  ? 'text-white/70'
                                  : 'text-muted-foreground',
                              )}
                            >
                              {msgTime(row.message.created_at)}
                              {row.mine && (
                                <MessageStatus
                                  message={row.message}
                                  labels={{
                                    sending: tAccount('inbox.statusSending'),
                                    sent: tAccount('inbox.statusSent'),
                                    read: tAccount('inbox.statusRead'),
                                  }}
                                />
                              )}
                            </span>
                          </div>
                        </div>
                      ),
                    )}
                  </>
                )}
              </div>

              {/* Композер */}
              <div className="shrink-0 border-t border-border p-3 sm:px-3.5">
                {sendError && (
                  <div className="mb-2 text-[12.5px] text-red">{sendError}</div>
                )}
                <div className="flex items-end gap-2">
                  <textarea
                    ref={taRef}
                    rows={1}
                    className={cn(
                      fieldClass,
                      'max-h-[120px] resize-none rounded-[20px] py-[11px] leading-snug',
                    )}
                    placeholder={tAccount('inbox.inputPlaceholder')}
                    value={text}
                    disabled={isSending}
                    onChange={(e) => {
                      setText(e.target.value);
                      autoGrow();
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        send();
                      }
                    }}
                  />
                  <Button
                    type="button"
                    onClick={send}
                    disabled={isSending || !text.trim()}
                    aria-label={tAccount('inbox.send')}
                    className="shrink-0"
                  >
                    <Send size={18} />
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center">
              <EmptyState
                icon={MessageCircle}
                title={tAccount('inbox.selectThreadTitle')}
                text={tAccount('inbox.selectThreadText')}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Статус своей реплики: отправляется (часы) / отправлено (✓) / прочитано (✓✓). */
function MessageStatus({
  message,
  labels,
}: {
  message: ChatMessage;
  labels: { sending: string; sent: string; read: string };
}) {
  if (message.pending === 'sending') {
    return <Clock size={13} aria-label={labels.sending} className="shrink-0" />;
  }
  if (message.is_read) {
    return (
      <CheckCheck
        size={14}
        aria-label={labels.read}
        className="shrink-0 text-white"
      />
    );
  }
  return <Check size={14} aria-label={labels.sent} className="shrink-0" />;
}
