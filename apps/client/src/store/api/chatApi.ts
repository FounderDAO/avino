/**
 * chatApi — чат покупателя/продавца (docs/API.md §13).
 *
 * MVP-транспорт — polling (потребитель включает pollingInterval через хуки).
 * Все ручки Bearer-only: гость получит 401, поэтому `Inbox.tsx` обязан
 * передавать `{ skip: !isAuthenticated }`.
 *
 * Лента сообщений приходит `created_at DESC` (свежие сверху — для keyset-листания
 * в историю); для показа разворачиваем в ASC (старые сверху) и отдаём
 * `olderCursor` для подгрузки более ранних. Свои реплики добавляются оптимистично
 * (см. `sendMessage.onQueryStarted`), поэтому отправка НЕ инвалидирует ленту —
 * только список диалогов (`Chat/LIST`: превью последней реплики + порядок).
 */
import { baseApi } from './baseApi';
import type { ChatMessage } from '@/features/account/chat-utils';

/** Тег списка диалогов — отделён от лент отдельных тредов (`Chat`/threadId). */
const THREADS_LIST_TAG = { type: 'Chat' as const, id: 'LIST' };

/** Превью объявления, привязанного к диалогу. */
export interface ApiThreadListingPreview {
  title: string;
  thumbnail_url: string | null;
  price: string | number;
  currency: string;
  status: string;
}

/** Профиль собеседника (API.md §13, optional non-breaking). */
export interface ApiThreadCounterparty {
  id: string;
  name: string | null;
  avatar_url: string | null;
}

/** Превью последней реплики треда (API.md §13, optional non-breaking). */
export interface ApiThreadLastMessage {
  id: string;
  sender_id: string | null;
  body: string;
  is_read: boolean;
  created_at: string;
}

/** Диалог (GET /chat/threads). Сортировка по last_message_at DESC. */
export interface ApiThread {
  id: string;
  listing_id: string;
  initiator_id: string;
  owner_id: string;
  last_message_at: string | null;
  unread_count: number;
  listing_preview: ApiThreadListingPreview | null;
  // Optional-расширения §13 — клиент толерантен к их отсутствию (старый бэк).
  counterparty?: ApiThreadCounterparty | null;
  last_message?: ApiThreadLastMessage | null;
}

/** Сообщение в диалоге (GET/POST /chat/threads/:id/messages). */
export type ApiMessage = ChatMessage;

/** Страница ленты: реплики в ASC + курсор более ранней страницы (или null). */
export interface ThreadMessagesPage {
  items: ChatMessage[];
  olderCursor: string | null;
}

/** Ответ POST /chat/threads (создание/идемпотентный возврат диалога). */
export interface ApiThreadCreated {
  id: string;
  listing_id: string;
  initiator_id: string;
  owner_id: string;
  created_at: string;
}

interface ThreadsEnvelope {
  data: ApiThread[];
  meta: { limit: number; total: number };
}

interface MessagesEnvelope {
  data: ApiMessage[];
  meta: { limit: number; next_cursor: string | null };
}

export const chatApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    /** Список диалогов текущего пользователя. GET /chat/threads?limit=50. */
    getThreads: build.query<ApiThread[], void>({
      query: () => '/chat/threads?limit=50',
      transformResponse: (env: ThreadsEnvelope): ApiThread[] => env.data,
      providesTags: [THREADS_LIST_TAG],
      keepUnusedDataFor: 30,
    }),

    /**
     * Страница сообщений. GET /chat/threads/:id/messages?limit=50[&cursor].
     * Без `cursor` — свежайшая страница (её поллит компонент); с `cursor` —
     * более ранняя (ленивая подгрузка истории). Ответ разворачивается в ASC.
     */
    getThreadMessages: build.query<
      ThreadMessagesPage,
      { threadId: string; cursor?: string }
    >({
      query: ({ threadId, cursor }) => {
        const params = new URLSearchParams({ limit: '50' });
        if (cursor) params.set('cursor', cursor);
        return `/chat/threads/${encodeURIComponent(threadId)}/messages?${params.toString()}`;
      },
      transformResponse: (env: MessagesEnvelope): ThreadMessagesPage => ({
        // Бэк: created_at DESC (свежие сверху) → разворот в ASC для показа.
        items: [...env.data].reverse(),
        olderCursor: env.meta.next_cursor,
      }),
      providesTags: (_result, _error, { threadId }) => [
        { type: 'Chat' as const, id: threadId },
      ],
      keepUnusedDataFor: 30,
    }),

    /**
     * Отправка сообщения. POST /chat/threads/:id/messages → 201.
     * Оптимистично добавляет реплику в свежую страницу ленты (`{ threadId }`),
     * затем заменяет временную на серверную. Инвалидирует только список диалогов
     * (превью/порядок), не трогая открытую ленту.
     */
    sendMessage: build.mutation<
      ApiMessage,
      { threadId: string; body: string; tempId: string; senderId: string | null }
    >({
      query: ({ threadId, body }) => ({
        url: `/chat/threads/${encodeURIComponent(threadId)}/messages`,
        method: 'POST',
        body: { body },
      }),
      async onQueryStarted(
        { threadId, body, tempId, senderId },
        { dispatch, queryFulfilled },
      ) {
        const temp: ChatMessage = {
          id: tempId,
          thread_id: threadId,
          sender_id: senderId,
          body,
          is_read: false,
          created_at: new Date().toISOString(),
          pending: 'sending',
        };
        const patch = dispatch(
          chatApi.util.updateQueryData(
            'getThreadMessages',
            { threadId },
            (draft) => {
              draft.items.push(temp);
            },
          ),
        );
        try {
          const { data: real } = await queryFulfilled;
          dispatch(
            chatApi.util.updateQueryData(
              'getThreadMessages',
              { threadId },
              (draft) => {
                const i = draft.items.findIndex((m) => m.id === tempId);
                if (i !== -1) draft.items[i] = { ...real };
                else draft.items.push({ ...real });
              },
            ),
          );
        } catch {
          patch.undo();
        }
      },
      invalidatesTags: [THREADS_LIST_TAG],
    }),

    /** Пометить диалог прочитанным. POST /chat/threads/:id/read → 204. */
    markThreadRead: build.mutation<void, string>({
      query: (threadId) => ({
        url: `/chat/threads/${encodeURIComponent(threadId)}/read`,
        method: 'POST',
      }),
      invalidatesTags: [THREADS_LIST_TAG],
    }),

    /** Создать (или идемпотентно вернуть) диалог. POST /chat/threads. */
    createThread: build.mutation<
      ApiThreadCreated,
      { listing_id: string; body: string }
    >({
      query: (body) => ({
        url: '/chat/threads',
        method: 'POST',
        body,
      }),
      invalidatesTags: [THREADS_LIST_TAG],
    }),
  }),
  overrideExisting: false,
});

export const {
  useGetThreadsQuery,
  useGetThreadMessagesQuery,
  useLazyGetThreadMessagesQuery,
  useSendMessageMutation,
  useMarkThreadReadMutation,
  useCreateThreadMutation,
} = chatApi;
