/**
 * chatApi — чат покупателя/продавца (docs/API.md §13).
 *
 * MVP-транспорт — polling (потребитель включает pollingInterval через хуки).
 * Все ручки Bearer-only: гость получит 401, поэтому `Inbox.tsx` обязан
 * передавать `{ skip: !isAuthenticated }`.
 *
 * ВАЖНО (контракт §13): Thread НЕ содержит имени/профиля собеседника и
 * текста последнего сообщения — только `listing_preview` + `unread_count`.
 * См. TODO в Inbox.tsx (chat-counterparty-identity / chat-thread-last-message).
 */
import { baseApi } from './baseApi';

/** Превью объявления, привязанного к диалогу. */
export interface ApiThreadListingPreview {
  title: string;
  thumbnail_url: string | null;
  price: string | number;
  currency: string;
  status: string;
}

/** Диалог (GET /chat/threads). Сортировка по last_message_at DESC. */
export interface ApiThread {
  id: string;
  listing_id: string;
  initiator_id: string;
  owner_id: string;
  last_message_at: string | null;
  unread_count: number;
  listing_preview: ApiThreadListingPreview;
}

/** Сообщение в диалоге (GET/POST /chat/threads/:id/messages). */
export interface ApiMessage {
  id: string;
  thread_id: string;
  sender_id: string;
  body: string;
  is_read: boolean;
  created_at: string;
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
      providesTags: ['Chat'],
      // Список переживает кратковременный размонтаж пейна (polling включается в компоненте).
      keepUnusedDataFor: 30,
    }),

    /** Сообщения диалога. GET /chat/threads/:id/messages?limit=50. */
    getThreadMessages: build.query<ApiMessage[], string>({
      query: (threadId) =>
        `/chat/threads/${encodeURIComponent(threadId)}/messages?limit=50`,
      transformResponse: (env: MessagesEnvelope): ApiMessage[] => env.data,
      providesTags: (_result, _error, threadId) => [
        { type: 'Chat' as const, id: threadId },
      ],
      keepUnusedDataFor: 30,
    }),

    /** Отправка сообщения. POST /chat/threads/:id/messages → 201. */
    sendMessage: build.mutation<
      ApiMessage,
      { threadId: string; body: string }
    >({
      query: ({ threadId, body }) => ({
        url: `/chat/threads/${encodeURIComponent(threadId)}/messages`,
        method: 'POST',
        body: { body },
      }),
      invalidatesTags: (_result, _error, { threadId }) => [
        { type: 'Chat' as const, id: threadId },
        'Chat',
      ],
    }),

    /** Пометить диалог прочитанным. POST /chat/threads/:id/read → 204. */
    markThreadRead: build.mutation<void, string>({
      query: (threadId) => ({
        url: `/chat/threads/${encodeURIComponent(threadId)}/read`,
        method: 'POST',
      }),
      invalidatesTags: ['Chat'],
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
      invalidatesTags: ['Chat'],
    }),
  }),
  overrideExisting: false,
});

export const {
  useGetThreadsQuery,
  useGetThreadMessagesQuery,
  useSendMessageMutation,
  useMarkThreadReadMutation,
  useCreateThreadMutation,
} = chatApi;
