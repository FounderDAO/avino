import { adminApi } from './adminApi';

export type LegalDocKindApi = 'TERMS' | 'PRIVACY';
export type LegalDocStatusApi = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

export interface AdminLegalDocMeta {
  id: string;
  kind: LegalDocKindApi;
  version: number;
  status: LegalDocStatusApi;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdminLegalDoc extends AdminLegalDocMeta {
  title_ru: string;
  title_uz: string;
  title_en: string;
  body_md_ru: string;
  body_md_uz: string;
  body_md_en: string;
}

export interface UpdateLegalDraftBody {
  title_ru?: string; title_uz?: string; title_en?: string;
  body_md_ru?: string; body_md_uz?: string; body_md_en?: string;
}

/**
 * adminLegalDocumentsApi — версии юр-документов (ADMIN, спека 2026-07-21).
 * CRUD черновика + publish (архивирует прежний PUBLISHED; requires_consent →
 * бамп legal_consent_version на бэке). Тег Admin — списки и settings-флаг
 * перечитываются после мутаций.
 */
export const adminLegalDocumentsApi = adminApi.injectEndpoints({
  endpoints: (build) => ({
    getLegalDocuments: build.query<AdminLegalDocMeta[], { kind?: LegalDocKindApi } | void>({
      query: (args) => ({
        url: '/admin/legal-documents',
        params: args?.kind ? { kind: args.kind } : undefined,
      }),
      providesTags: ['Admin'],
    }),
    getLegalDocument: build.query<AdminLegalDoc, string>({
      query: (id) => ({ url: `/admin/legal-documents/${id}` }),
      providesTags: ['Admin'],
    }),
    createLegalDraft: build.mutation<AdminLegalDoc, { kind: LegalDocKindApi }>({
      query: (body) => ({ url: '/admin/legal-documents', method: 'POST', body }),
      invalidatesTags: ['Admin'],
    }),
    updateLegalDraft: build.mutation<AdminLegalDoc, { id: string; body: UpdateLegalDraftBody }>({
      query: ({ id, body }) => ({ url: `/admin/legal-documents/${id}`, method: 'PATCH', body }),
      invalidatesTags: ['Admin'],
    }),
    publishLegalDocument: build.mutation<AdminLegalDoc, { id: string; requires_consent: boolean }>({
      query: ({ id, requires_consent }) => ({
        url: `/admin/legal-documents/${id}/publish`,
        method: 'POST',
        body: { requires_consent },
      }),
      invalidatesTags: ['Admin'],
    }),
    deleteLegalDraft: build.mutation<void, string>({
      query: (id) => ({ url: `/admin/legal-documents/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Admin'],
    }),
  }),
  overrideExisting: false,
});

export const {
  useGetLegalDocumentsQuery,
  useGetLegalDocumentQuery,
  useCreateLegalDraftMutation,
  useUpdateLegalDraftMutation,
  usePublishLegalDocumentMutation,
  useDeleteLegalDraftMutation,
} = adminLegalDocumentsApi;
