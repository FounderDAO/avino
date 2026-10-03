/**
 * Галерея объявления в админской карточке: все фото, обложка — первое по
 * `sort_order`, загрузка нескольких файлов по одному, порядок стрелками и
 * «Сделать обложкой», удаление с подтверждением. DnD-библиотеки в проекте нет.
 */
'use client';

import { useMemo, useRef, useState } from 'react';
import type { SerializedError } from '@reduxjs/toolkit';
import type { FetchBaseQueryError } from '@reduxjs/toolkit/query';
import { ConfirmModal } from '@/components/admin/ConfirmModal';
import { useToast } from '@/components/admin/toast';
import {
  useDeleteListingMediaMutation,
  useReorderListingMediaMutation,
  useUploadListingMediaMutation,
} from '@/store/api/adminListingMediaApi';
import type { ListingMedia } from '@/store/api/adminTypes';
import { getApiErrorCode } from '@/store/api/apiError';
import {
  checkMediaFiles,
  makeCover,
  MEDIA_ACCEPT,
  MEDIA_MAX,
  mediaErrorText,
  moveMedia,
  sortedMedia,
} from '@/lib/adapters/listingMedia';

interface ListingMediaManagerProps {
  listingId: string;
  media: ListingMedia[];
}

const codeOf = (e: unknown) => getApiErrorCode(e as FetchBaseQueryError | SerializedError);

export function ListingMediaManager({ listingId, media }: ListingMediaManagerProps) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [toDelete, setToDelete] = useState<string | null>(null);
  const [upload] = useUploadListingMediaMutation();
  const [remove, { isLoading: deleting }] = useDeleteListingMediaMutation();
  const [reorder, { isLoading: reordering }] = useReorderListingMediaMutation();

  const items = useMemo(() => sortedMedia(media), [media]);
  const ids = items.map((m) => m.id);
  const busy = progress !== null || deleting || reordering;

  async function onFiles(list: FileList | null) {
    const files = Array.from(list ?? []);
    if (files.length === 0) return;
    const checks = checkMediaFiles(files, items.length);
    const rejected = checks.flatMap((c) => (c.ok ? [] : [c.reason]));
    if (rejected.length > 0) toast(rejected.join('; '));
    const accepted = checks.flatMap((c) => (c.ok ? [files[c.index]] : []));
    if (accepted.length === 0) return;
    setProgress({ done: 0, total: accepted.length });
    let failed = 0;
    for (const [i, file] of accepted.entries()) {
      try {
        await upload({ listingId, file }).unwrap();
      } catch (e) {
        failed += 1;
        toast(`${file.name}: ${mediaErrorText(codeOf(e))}`);
      }
      setProgress({ done: i + 1, total: accepted.length });
    }
    setProgress(null);
    if (failed === 0) toast(`Загружено фото: ${accepted.length}`);
  }

  async function applyOrder(order: string[] | null) {
    if (!order) return;
    try {
      await reorder({ listingId, order }).unwrap();
    } catch (e) {
      toast(mediaErrorText(codeOf(e)));
    }
  }

  async function confirmDelete() {
    if (!toDelete) return;
    try {
      await remove({ listingId, mediaId: toDelete }).unwrap();
      toast('Фото удалено');
    } catch (e) {
      toast(mediaErrorText(codeOf(e)));
    } finally {
      setToDelete(null);
    }
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <div className="row gap-8" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontSize: 13, color: 'var(--muted)' }}>
          Фото: {items.length} / {MEDIA_MAX}
          {progress && ` · загрузка ${progress.done} из ${progress.total}`}
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          accept={MEDIA_ACCEPT.join(',')}
          onChange={(e) => {
            void onFiles(e.target.files);
            e.target.value = '';
          }}
        />
        <button
          className="abtn abtn-outline"
          style={busy || items.length >= MEDIA_MAX ? { opacity: 0.5 } : {}}
          disabled={busy || items.length >= MEDIA_MAX}
          onClick={() => inputRef.current?.click()}
        >
          Добавить фото
        </button>
      </div>
      {items.length === 0 ? (
        <div className="a-card" style={{ padding: 18, color: 'var(--muted)', fontSize: 14 }}>Фото нет</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
          {items.map((item, index) => (
            <div key={item.id} className="a-card" style={{ padding: 6, borderRadius: 10 }}>
              <div style={{ position: 'relative', aspectRatio: '4/3', borderRadius: 8, overflow: 'hidden' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.thumbnail_url ?? item.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                {index === 0 && (
                  <span className="a-pill" style={{ position: 'absolute', left: 6, top: 6, background: 'var(--mint)', color: 'var(--teal-deep)' }}>
                    Обложка
                  </span>
                )}
              </div>
              <div className="row gap-4" style={{ marginTop: 6, justifyContent: 'space-between', flexWrap: 'wrap' }}>
                <button className="abtn abtn-ghost" disabled={busy || index === 0} onClick={() => void applyOrder(moveMedia(ids, item.id, -1))} aria-label="Левее">←</button>
                <button className="abtn abtn-ghost" disabled={busy || index === items.length - 1} onClick={() => void applyOrder(moveMedia(ids, item.id, 1))} aria-label="Правее">→</button>
                {index > 0 && (
                  <button className="abtn abtn-ghost" disabled={busy} onClick={() => void applyOrder(makeCover(ids, item.id))}>Обложка</button>
                )}
                <button className="abtn abtn-ghost" style={{ color: 'var(--red)' }} disabled={busy} onClick={() => setToDelete(item.id)}>Удалить</button>
              </div>
            </div>
          ))}
        </div>
      )}
      {toDelete && (
        <ConfirmModal
          title="Удалить фото?"
          message="Фото будет удалено из объявления без возможности восстановления."
          confirmLabel="Удалить"
          tone="danger"
          isSubmitting={deleting}
          onConfirm={() => void confirmDelete()}
          onClose={() => setToDelete(null)}
        />
      )}
    </div>
  );
}
