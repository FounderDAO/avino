/**
 * tourRequestsApi — заявки на тур (просмотр), backend PR #209 (API.md «tour-requests»).
 *  - POST   /tour-requests              — создать заявку (Bearer).
 *  - GET    /tour-requests/outgoing     — мои отправленные (покупатель).
 *  - GET    /tour-requests/incoming     — входящие по моим объявлениям (владелец).
 *  - PATCH  /tour-requests/:id/status   — { action: CONFIRM|DECLINE|CANCEL }.
 *  - GET    /tour-requests/taken        — занятые слоты листинга (для модалки).
 * Списки приходят envelope { data, meta } → transformResponse отдаёт массив.
 */
import { baseApi } from './baseApi';

export type TourRequestStatus = 'PENDING' | 'CONFIRMED' | 'DECLINED' | 'CANCELLED';
export type TourAction = 'CONFIRM' | 'DECLINE' | 'CANCEL';

/** Объект заявки (snake_case контракт бэкенда). */
export interface TourRequestItem {
  id: string;
  listing_id: string;
  requester_id: string;
  status: TourRequestStatus;
  requested_date: string; // YYYY-MM-DD
  window_start: string;
  window_end: string;
  requester_name: string;
  requester_phone: string;
  message: string | null;
  created_at: string;
}

/** Тело POST /tour-requests. */
export interface CreateTourRequestBody {
  listing_id: string;
  requested_date: string;
  window_start: string;
  window_end: string;
  requester_name: string;
  requester_phone: string;
  message?: string;
}

interface TourListEnvelope {
  data: TourRequestItem[];
  meta: { limit: number; total: number; next_cursor: string | null };
}

/** Занятый слот тура (GET /tour-requests/taken): анонимно, только дата и окно. */
export interface TakenSlot {
  requested_date: string; // YYYY-MM-DD
  window_start: string;
  window_end: string;
}

interface TakenSlotsEnvelope {
  data: TakenSlot[];
}

const OUTGOING_TAG = { type: 'TourRequest' as const, id: 'OUTGOING' };
const INCOMING_TAG = { type: 'TourRequest' as const, id: 'INCOMING' };

export const tourRequestsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    createTourRequest: build.mutation<TourRequestItem, CreateTourRequestBody>({
      query: (body) => ({ url: '/tour-requests', method: 'POST', body }),
      invalidatesTags: (result, error, body) => [
        OUTGOING_TAG,
        { type: 'TourTakenSlots' as const, id: body.listing_id },
      ],
    }),
    getOutgoingTours: build.query<TourRequestItem[], void>({
      query: () => '/tour-requests/outgoing?limit=50',
      transformResponse: (env: TourListEnvelope) => env.data,
      providesTags: [OUTGOING_TAG],
    }),
    getIncomingTours: build.query<TourRequestItem[], void>({
      query: () => '/tour-requests/incoming?limit=50',
      transformResponse: (env: TourListEnvelope) => env.data,
      providesTags: [INCOMING_TAG],
    }),
    updateTourStatus: build.mutation<TourRequestItem, { id: string; action: TourAction }>({
      query: ({ id, action }) => ({ url: `/tour-requests/${id}/status`, method: 'PATCH', body: { action } }),
      invalidatesTags: (result) => [
        OUTGOING_TAG,
        INCOMING_TAG,
        ...(result
          ? [{ type: 'TourTakenSlots' as const, id: result.listing_id }]
          : []),
      ],
    }),
    getTakenSlots: build.query<TakenSlot[], string>({
      query: (listingId) => `/tour-requests/taken?listing_id=${listingId}`,
      transformResponse: (env: TakenSlotsEnvelope) => env.data,
      providesTags: (result, error, listingId) => [
        { type: 'TourTakenSlots' as const, id: listingId },
      ],
    }),
  }),
  overrideExisting: false,
});

export const {
  useCreateTourRequestMutation,
  useGetOutgoingToursQuery,
  useGetIncomingToursQuery,
  useUpdateTourStatusMutation,
  useGetTakenSlotsQuery,
} = tourRequestsApi;
