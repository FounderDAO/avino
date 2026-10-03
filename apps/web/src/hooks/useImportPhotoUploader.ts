'use client';

import { useCallback, useEffect, useState } from 'react';
import type { SerializedError } from '@reduxjs/toolkit';
import type { FetchBaseQueryError } from '@reduxjs/toolkit/query';
import { useUploadListingImportPhotoMutation } from '@/store/api/adminListingImportsApi';
import type { ListingImportPhoto } from '@/store/api/adminTypes';
import { getApiErrorCode } from '@/store/api/apiError';
import { importPhotoUploadErrorText } from '@/lib/adapters/listingImports';
import { runPool, withRetry } from '@/lib/importPhotoPool';

const CONCURRENCY = 3;
const NETWORK_RETRIES = 2;

/** Сеть или 5xx — повторяем; 4xx — ответ окончательный. */
function isTransient(error: unknown): boolean {
  const status = (error as FetchBaseQueryError | undefined)?.status;
  return typeof status !== 'number' || status >= 500;
}

/**
 * Загрузка фото из выбранной папки в сохранённый импорт: 3 параллельно, до 2
 * повторов на сетевую ошибку. Пока идёт загрузка, закрытие вкладки
 * предупреждается (`beforeunload`).
 */
export function useImportPhotoUploader(importId: string | null) {
  const [upload] = useUploadListingImportPhotoMutation();
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [results, setResults] = useState<Map<string, ListingImportPhoto>>(new Map());
  const [errors, setErrors] = useState<Map<string, string>>(new Map());
  const active = progress !== null;

  useEffect(() => {
    if (!active) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [active]);

  const start = useCallback(
    async (photos: ListingImportPhoto[], files: Map<string, File>) => {
      if (!importId) return;
      const queue = photos.filter((p) => p.id !== null && files.has(p.ref.toLowerCase()));
      if (queue.length === 0) return;
      let done = 0;
      setProgress({ done, total: queue.length });
      await runPool(queue, CONCURRENCY, async (photo) => {
        const id = photo.id as string;
        try {
          const updated = await withRetry(
            () => upload({ importId, photoId: id, file: files.get(photo.ref.toLowerCase()) as File }).unwrap(),
            NETWORK_RETRIES,
            isTransient,
          );
          setResults((prev) => new Map(prev).set(id, updated));
        } catch (error) {
          const code = getApiErrorCode(error as FetchBaseQueryError | SerializedError);
          setErrors((prev) => new Map(prev).set(id, importPhotoUploadErrorText(code)));
        } finally {
          done += 1;
          setProgress({ done, total: queue.length });
        }
      });
      setProgress(null);
    },
    [importId, upload],
  );

  return { start, progress, results, errors, active };
}
