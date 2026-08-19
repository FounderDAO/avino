import { baseApi } from './baseApi';

/** Коды причин жалобы — контракт API (спека 2026-08-19, Apple 1.2). */
export type ComplaintReason =
  | 'SPAM'
  | 'FRAUD'
  | 'WRONG_INFO'
  | 'OFFENSIVE'
  | 'ALREADY_SOLD'
  | 'OTHER';

export const COMPLAINT_REASONS: ComplaintReason[] = [
  'SPAM',
  'FRAUD',
  'WRONG_INFO',
  'OFFENSIVE',
  'ALREADY_SOLD',
  'OTHER',
];

export interface CreateComplaintBody {
  listing_id: string;
  reason: ComplaintReason;
  details?: string;
}

export interface ComplaintReceipt {
  id: string;
  status: string;
}

/** POST /complaints — жалоба на объявление (Bearer-only, fire-and-forget). */
export const complaintsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    createComplaint: build.mutation<ComplaintReceipt, CreateComplaintBody>({
      query: (body) => ({ url: '/complaints', method: 'POST', body }),
    }),
  }),
  overrideExisting: false,
});

export const { useCreateComplaintMutation } = complaintsApi;
