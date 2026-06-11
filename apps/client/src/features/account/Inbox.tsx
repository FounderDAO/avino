/**
 * Inbox — вкладка «Сообщения» (auth-aware, серверный чат, docs/API.md §13).
 *
 * Два пейна: слева список диалогов (GET /chat/threads, polling 10s), справа
 * переписка выбранного диалога (GET /chat/threads/:id/messages, polling 6s).
 * Отправка — POST .../messages; открытие диалога с непрочитанными — POST .../read.
 *
 * Гость: ручки защищены (401) — показываем подсказку войти, запросы skip-аются.
 *
 * Ограничения контракта §13 (см. TODO ниже):
 * - Thread не несёт имени/профиля собеседника → в списке показываем заголовок
 *   объявления (listing_preview.title), аватар-инициал берём из него.
 * - Thread не несёт текста последнего сообщения → вторичная строка строки = цена
 *   объявления (или статус), а не превью реплики.
 */
'use client';

import * as React from 'react';
import Link from 'next/link';
import { MessageCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { fieldClass } from '@/components/ui/field';
import { formatMoney, formatRelativeDate } from '@/lib/format';
import { useAppSelector } from '@/store/hooks';
import { selectCurrentUser, selectIsAuthenticated } from '@/store/slices/authSlice';
import { getApiError } from '@/store/api/apiError';
import {
  useGetThreadsQuery,
  useGetThreadMessagesQuery,
  useSendMessageMutation,
  useMarkThreadReadMutation,
  type ApiThread,
} from '@/store/api/chatApi';

// TODO(chat-counterparty-identity): API §13 не возвращает имя/профиль собеседника
// в Thread — используем заголовок объявления как первичную строку и инициал.
// TODO(chat-thread-last-message): API §13 не возвращает текст последнего сообщения
// в Thread — вторичная строка показывает цену/статус объявления вместо превью.

/** Аватар-инициал из заголовка объявления (фолбэк — «#»). */
function threadInitial(t: ApiThread): string {
  return t.listing_preview.title.trim()[0]?.toUpperCase() ?? '#';
}

/** Вторичная строка строки списка: цена объявления либо статус. */
function threadSubtitle(t: ApiThread): string {
  const { price, currency, status } = t.listing_preview;
  const n = Number(price);
  if (Number.isFinite(n) && n > 0) {
    // API возвращает currency строкой; formatMoney различает только USD vs прочее.
    return formatMoney(price, currency === 'USD' ? 'USD' : 'UZS');
  }
  return status;
}

/** Время сообщения «12:40» (локальное). */
function msgTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

export function Inbox() {
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const currentUser = useAppSelector(selectCurrentUser);
  const currentUserId = currentUser?.id ?? null;

  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [text, setText] = React.useState('');

  const {
    data: threads,
    isLoading: threadsLoading,
  } = useGetThreadsQuery(undefined, {
    skip: !isAuthenticated,
    pollingInterval: 10000,
  });

  // Автовыбор первого диалога при первой загрузке.
  React.useEffect(() => {
    if (selectedId == null && threads && threads.length > 0) {
      setSelectedId(threads[0].id);
    }
  }, [threads, selectedId]);

  const selectedThread =
    threads?.find((t) => t.id === selectedId) ?? null;

  const {
    data: messages,
    isLoading: messagesLoading,
  } = useGetThreadMessagesQuery(selectedId ?? '', {
    skip: !isAuthenticated || selectedId == null,
    pollingInterval: 6000,
  });

  const [markRead] = useMarkThreadReadMutation();
  const [sendMessage, { isLoading: isSending }] = useSendMessageMutation();
  const [sendError, setSendError] = React.useState<string | null>(null);

  // Помечаем диалог прочитанным один раз на «состояние непрочитанности».
  // Триггерим, когда у выбранного диалога есть unread_count > 0 или в messages
  // присутствуют входящие непрочитанные сообщения.
  const markedRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (selectedId == null) return;
    const hasUnreadThread = (selectedThread?.unread_count ?? 0) > 0;
    const hasUnreadIncoming = (messages ?? []).some(
      (m) => !m.is_read && m.sender_id !== currentUserId,
    );
    const key = `${selectedId}:${selectedThread?.unread_count ?? 0}`;
    if ((hasUnreadThread || hasUnreadIncoming) && markedRef.current !== key) {
      markedRef.current = key;
      void markRead(selectedId);
    }
  }, [selectedId, selectedThread, messages, currentUserId, markRead]);

  const openThread = (id: string) => {
    setSelectedId(id);
    setSendError(null);
    markedRef.current = null;
  };

  const send = async () => {
    const body = text.trim();
    if (!body || selectedId == null || isSending) return;
    setSendError(null);
    try {
      await sendMessage({ threadId: selectedId, body }).unwrap();
      setText('');
    } catch (err) {
      const apiErr = getApiError(
        err as Parameters<typeof getApiError>[0],
      );
      setSendError(apiErr?.message ?? 'Не удалось отправить сообщение');
    }
  };

  // ─── Гость ────────────────────────────────────────────────────────────────
  if (!isAuthenticated) {
    return (
      <div>
        <h1 className="mb-[18px] text-[28px]">Сообщения</h1>
        <EmptyState
          icon={MessageCircle}
          title="Войдите, чтобы видеть сообщения"
          text="Здесь появятся ваши диалоги с авторами объявлений."
          action={
            <Button asChild>
              {/* Вход — модалка в Header; /login-маршрута нет. */}
              <Link href="/">На главную</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const list = threads ?? [];

  return (
    <div>
      <h1 className="mb-[18px] text-[28px]">Сообщения</h1>
      <div className="grid h-[540px] grid-cols-1 overflow-hidden rounded-card border border-border/60 bg-surface shadow-card sm:grid-cols-[300px_1fr]">
        {/* Список диалогов */}
        <div className="hidden overflow-y-auto border-r border-border sm:block">
          {threadsLoading ? (
            <div className="flex flex-col gap-2 p-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-[58px] rounded-card" />
              ))}
            </div>
          ) : list.length === 0 ? (
            <EmptyState
              icon={MessageCircle}
              title="Сообщений пока нет"
              className="py-10"
            />
          ) : (
            list.map((t) => (
              <button
                key={t.id}
                onClick={() => openThread(t.id)}
                className={cn(
                  'flex w-full gap-3 border-b border-border px-4 py-3.5 text-left',
                  selectedId === t.id
                    ? 'bg-surface-2'
                    : 'bg-transparent hover:bg-surface-2',
                )}
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-mint font-extrabold text-teal-deep">
                  {threadInitial(t)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <b className="truncate text-[14.5px]">
                      {t.listing_preview.title}
                    </b>
                    <span className="whitespace-nowrap text-xs text-muted-foreground">
                      {formatRelativeDate(t.last_message_at)}
                    </span>
                  </span>
                  <span className="mt-0.5 block truncate text-[12.5px] text-muted-foreground">
                    {threadSubtitle(t)}
                  </span>
                </span>
                {t.unread_count > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center self-center rounded-pill bg-red px-1.5 text-[11.5px] font-extrabold text-white">
                    {t.unread_count}
                  </span>
                )}
              </button>
            ))
          )}
        </div>

        {/* Окно переписки */}
        <div className="flex min-w-0 flex-col">
          {selectedThread ? (
            <>
              <div className="flex items-center gap-3 border-b border-border px-[18px] py-3.5">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-mint font-extrabold text-teal-deep">
                  {threadInitial(selectedThread)}
                </span>
                <div className="min-w-0">
                  <div className="truncate font-bold">
                    {selectedThread.listing_preview.title}
                  </div>
                  <div className="text-[12.5px] text-muted-foreground">
                    {threadSubtitle(selectedThread)}
                  </div>
                </div>
              </div>

              <div className="flex flex-1 flex-col gap-2 overflow-y-auto bg-surface-2 p-[18px]">
                {messagesLoading ? (
                  <div className="flex flex-col gap-2">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <Skeleton
                        key={i}
                        className={cn(
                          'h-9 w-[60%] rounded-[14px]',
                          i % 2 === 0 ? 'self-start' : 'self-end',
                        )}
                      />
                    ))}
                  </div>
                ) : (
                  (messages ?? []).map((m) => {
                    const mine = m.sender_id === currentUserId;
                    return (
                      <div
                        key={m.id}
                        className={cn(
                          'max-w-[72%] rounded-[14px] px-3.5 py-2.5 text-[14.5px]',
                          mine
                            ? 'self-end rounded-br-[4px] bg-red text-white'
                            : 'self-start rounded-bl-[4px] border border-border bg-surface text-ink',
                        )}
                      >
                        <span className="block">{m.body}</span>
                        <span
                          className={cn(
                            'mt-1 block text-right text-[10.5px]',
                            mine ? 'text-white/70' : 'text-muted-foreground',
                          )}
                        >
                          {msgTime(m.created_at)}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="border-t border-border p-3.5">
                {sendError && (
                  <div className="mb-2 text-[12.5px] text-red">{sendError}</div>
                )}
                <div className="flex gap-2">
                  <input
                    className={cn(fieldClass, 'rounded-pill')}
                    placeholder="Напишите сообщение…"
                    value={text}
                    disabled={isSending}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void send();
                    }}
                  />
                  <Button
                    type="button"
                    onClick={() => void send()}
                    disabled={isSending || !text.trim()}
                    className="shrink-0"
                  >
                    Отправить
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center">
              <EmptyState
                icon={MessageCircle}
                title="Выберите диалог"
                text="Слева — список ваших переписок."
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
