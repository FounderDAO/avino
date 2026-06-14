/**
 * chat-utils — чистая логика ленты сообщений Inbox (без React/RTK), чтобы
 * покрыть тестами самые хрупкие места: порядок (бэк отдаёт `created_at DESC`,
 * показываем ASC), разделители дней, группировку подряд идущих реплик одного
 * автора, слияние «старых» страниц с поллингом без дублей и превью последней
 * реплики для списка диалогов.
 */

/** Сообщение чата. `pending` — клиентский флаг оптимистичной отправки. */
export interface ChatMessage {
  id: string;
  thread_id: string;
  sender_id: string | null;
  body: string;
  is_read: boolean;
  created_at: string;
  /** Только на клиенте: реплика добавлена оптимистично и ещё не подтверждена. */
  pending?: 'sending';
}

/** Реплики группируются в одну «пачку», если интервал между ними < 5 минут. */
const GROUP_WINDOW_MS = 5 * 60 * 1000;

/** Ключ локального дня `YYYY-MM-DD` для разделителей по датам. */
export function localDayKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Стабильный компаратор по `(created_at ASC, id ASC)`. */
function byCreatedAtAsc(a: ChatMessage, b: ChatMessage): number {
  const ta = new Date(a.created_at).getTime();
  const tb = new Date(b.created_at).getTime();
  if (ta !== tb) return ta - tb;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Слияние «старых» (подгруженных) и «свежих» (поллинг) страниц в единую
 * ASC-ленту без дублей. Обе части уже ASC; дедуп по `id` страхует от перекрытия
 * на стыке, финальная сортировка — от перестановок и оптимистичных реплик.
 */
export function mergeMessages(
  older: readonly ChatMessage[],
  latest: readonly ChatMessage[],
): ChatMessage[] {
  const seen = new Set<string>();
  const out: ChatMessage[] = [];
  for (const m of [...older, ...latest]) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    out.push(m);
  }
  return out.sort(byCreatedAtAsc);
}

/** Разделитель дня в ленте. */
export interface DayRow {
  kind: 'day';
  key: string;
  iso: string;
}

/** Строка-сообщение в ленте. */
export interface MessageRow {
  kind: 'msg';
  key: string;
  message: ChatMessage;
  /** Реплика текущего пользователя (выравнивание вправо, статусы прочтения). */
  mine: boolean;
  /** Продолжение «пачки» того же автора (более плотный отступ сверху). */
  grouped: boolean;
}

export type ChatRow = DayRow | MessageRow;

/**
 * Разворачивает ASC-ленту в строки рендера: вставляет разделитель при смене
 * локального дня и помечает `grouped` для подряд идущих реплик одного автора
 * в пределах {@link GROUP_WINDOW_MS}. После разделителя `grouped` всегда `false`
 * (смена дня рвёт пачку).
 */
export function buildMessageRows(
  messages: readonly ChatMessage[],
  currentUserId: string | null,
): ChatRow[] {
  const rows: ChatRow[] = [];
  let prev: ChatMessage | null = null;
  for (const m of messages) {
    const day = localDayKey(m.created_at);
    const sameDay = prev !== null && localDayKey(prev.created_at) === day;
    if (!sameDay) {
      rows.push({ kind: 'day', key: `day-${day}`, iso: m.created_at });
    }
    const grouped =
      sameDay &&
      prev !== null &&
      prev.sender_id === m.sender_id &&
      new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() <
        GROUP_WINDOW_MS;
    rows.push({
      kind: 'msg',
      key: m.id,
      message: m,
      mine: currentUserId !== null && m.sender_id === currentUserId,
      grouped,
    });
    prev = m;
  }
  return rows;
}

/**
 * Превью последней реплики для вторичной строки списка диалогов. Свои реплики
 * префиксуются ярлыком «Вы». Возвращает `null`, если сообщений в треде ещё нет
 * (вызывающий показывает фолбэк — цену/статус объявления).
 */
export function lastMessagePreview(
  last: Pick<ChatMessage, 'body' | 'sender_id'> | null | undefined,
  currentUserId: string | null,
  youLabel: string,
): string | null {
  if (!last) return null;
  const body = last.body.replace(/\s+/g, ' ').trim();
  if (!body) return null;
  const mine = currentUserId !== null && last.sender_id === currentUserId;
  return mine ? `${youLabel}: ${body}` : body;
}
