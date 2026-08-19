import { baseApi } from './baseApi';

/** Элемент GET /blocks — заблокированный пользователь. */
export interface BlockedUser {
  user_id: string;
  name: string | null;
  avatar_url: string | null;
  blocked_at: string;
}

export interface BlockReceipt {
  id: string;
  user_id: string;
  created_at: string;
}

/**
 * /blocks — блокировка пользователей (Apple 1.2, спека 2026-08-19).
 * Инвалидация 'Chat' убирает скрытый тред из списка, 'Search' обновляет
 * выдачу (сервер фильтрует объявления заблокированных).
 */
export const blocksApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getBlocks: build.query<{ data: BlockedUser[] }, void>({
      query: () => '/blocks',
      providesTags: ['Block'],
    }),
    createBlock: build.mutation<BlockReceipt, { user_id: string }>({
      query: (body) => ({ url: '/blocks', method: 'POST', body }),
      invalidatesTags: ['Block', 'Chat', 'Search'],
    }),
    deleteBlock: build.mutation<void, string>({
      query: (userId) => ({ url: `/blocks/${userId}`, method: 'DELETE' }),
      invalidatesTags: ['Block', 'Chat', 'Search'],
    }),
  }),
  overrideExisting: false,
});

export const {
  useGetBlocksQuery,
  useCreateBlockMutation,
  useDeleteBlockMutation,
} = blocksApi;
