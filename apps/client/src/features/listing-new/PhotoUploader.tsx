/**
 * PhotoUploader — загрузчик фото-ЗАГЛУШКА (порт PhotoUploader из listing-new.jsx).
 * Реальной загрузки нет: файлы превращаются в blob-URL через URL.createObjectURL.
 * Поддержка: выбор/перетаскивание файлов в зону, drag&drop переупорядочивания,
 * удаление, назначение обложки. Первое фото — обложка.
 */
'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Camera, X } from 'lucide-react';
import { PhotoImg } from '@/components/ui/photo-img';

/**
 * Ограничения ниже зеркалят серверные (`listing-media.service.ts`): API режет
 * MIME по allow-list (415), размер (413) и число медиа (422). Проверяем их на
 * клиенте, чтобы пользователь узнал о проблеме при выборе файлов, а не после
 * публикации — HEIC с iPhone проходит `accept="image/*"`, но отвергается API.
 */
const ACCEPTED_MIME = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_PHOTOS = 20;

/** Сколько файлов отклонено и почему (для сообщения под дропзоной). */
interface RejectedCounts {
  type: number;
  size: number;
  limit: number;
}

/** Одно фото в загрузчике. */
export interface UploadPhoto {
  id: string;
  url: string;
  /** Исходный File (для multipart-загрузки). Отсутствует у уже загруженных фото (edit). */
  file?: File;
}

export interface PhotoUploaderProps {
  photos: UploadPhoto[];
  /** Сеттер в стиле useState (значение или функция-апдейтер). */
  setPhotos: (next: UploadPhoto[] | ((prev: UploadPhoto[]) => UploadPhoto[])) => void;
}

const uid = () => Math.random().toString(36).slice(2);

export function PhotoUploader({ photos, setPhotos }: PhotoUploaderProps) {
  const t = useTranslations('listingNew');
  const dragIdx = useRef<number | null>(null);
  const [rejected, setRejected] = useState<RejectedCounts | null>(null);

  /**
   * Добавить выбранные файлы, создав blob-URL. Файлы с неподдерживаемым типом
   * или размером отбрасываются, лишние сверх MAX_PHOTOS — тоже; счётчики
   * попадают в сообщение под дропзоной.
   */
  const onFiles = (files: FileList | null) => {
    if (!files) return;

    const counts: RejectedCounts = { type: 0, size: 0, limit: 0 };
    const accepted: File[] = [];
    for (const f of files) {
      if (!ACCEPTED_MIME.includes(f.type)) counts.type += 1;
      else if (f.size > MAX_FILE_SIZE_BYTES) counts.size += 1;
      else accepted.push(f);
    }

    const free = Math.max(0, MAX_PHOTOS - photos.length);
    counts.limit = Math.max(0, accepted.length - free);

    const arr = accepted
      .slice(0, free)
      .map((f) => ({ id: uid(), url: URL.createObjectURL(f), file: f }));
    if (arr.length) setPhotos((p) => [...p, ...arr]);

    setRejected(counts.type || counts.size || counts.limit ? counts : null);
  };

  const remove = (id: string) => setPhotos((p) => p.filter((x) => x.id !== id));

  /** Переставить фото из позиции from в позицию to. */
  const reorder = (from: number, to: number) =>
    setPhotos((p) => {
      const a = [...p];
      const [m] = a.splice(from, 1);
      a.splice(to, 0, m);
      return a;
    });

  return (
    <div>
      {/* Drag&drop / выбор файлов */}
      <label
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          onFiles(e.dataTransfer.files);
        }}
        className="flex cursor-pointer flex-col items-center gap-2 rounded-input border-2 border-dashed border-border bg-surface-2 px-5 py-8 text-center"
      >
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-mint text-teal">
          <Camera size={24} />
        </span>
        <div className="font-bold">{t('photoUploader.dropTitle')}</div>
        <div className="text-[13px] text-muted-foreground">{t('photoUploader.dropHint')}</div>
        <input
          type="file"
          accept={ACCEPTED_MIME.join(',')}
          multiple
          className="hidden"
          onChange={(e) => {
            onFiles(e.target.files);
            // Сброс value: иначе повторный выбор файла с тем же именем (например
            // после конвертации HEIC → JPG) не вызовет change.
            e.target.value = '';
          }}
        />
      </label>

      {rejected && (
        <div
          role="alert"
          className="mt-3 space-y-1 rounded-input bg-red/5 px-3.5 py-2.5 text-[13px] text-red"
        >
          {rejected.type > 0 && <p>{t('photoUploader.rejectedType', { count: rejected.type })}</p>}
          {rejected.size > 0 && <p>{t('photoUploader.rejectedSize', { count: rejected.size })}</p>}
          {rejected.limit > 0 && (
            <p>{t('photoUploader.rejectedLimit', { count: rejected.limit, max: MAX_PHOTOS })}</p>
          )}
        </div>
      )}

      {photos.length > 0 && (
        <div className="mt-3.5 grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-2.5">
          {photos.map((ph, i) => (
            <div
              key={ph.id}
              draggable
              onDragStart={() => (dragIdx.current = i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragIdx.current !== null && dragIdx.current !== i) reorder(dragIdx.current, i);
                dragIdx.current = null;
              }}
              className={
                'relative aspect-square cursor-grab overflow-hidden rounded-[12px] ' +
                (i === 0 ? 'border-2 border-red' : 'border border-border')
              }
            >
              <PhotoImg src={ph.url} alt="" className="h-full w-full" />
              {i === 0 && (
                <span className="absolute left-1.5 top-1.5 rounded-badge bg-red px-2 py-0.5 text-[11px] font-bold text-white">
                  {t('photoUploader.cover')}
                </span>
              )}
              <button
                type="button"
                onClick={() => remove(ph.id)}
                aria-label={t('photoUploader.remove')}
                className="absolute right-1.5 top-1.5 flex h-[26px] w-[26px] items-center justify-center rounded-full bg-ink/70 text-white"
              >
                <X size={15} />
              </button>
              {i !== 0 && (
                <button
                  type="button"
                  onClick={() => reorder(i, 0)}
                  className="absolute bottom-1.5 left-1.5 whitespace-nowrap rounded-md bg-white/95 px-2 py-[3px] text-[11px] font-bold text-ink"
                >
                  {t('photoUploader.makeCover')}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
