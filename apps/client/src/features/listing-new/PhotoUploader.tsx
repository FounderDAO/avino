/**
 * PhotoUploader — загрузчик фото-ЗАГЛУШКА (порт PhotoUploader из listing-new.jsx).
 * Реальной загрузки нет: файлы превращаются в blob-URL через URL.createObjectURL.
 * Поддержка: выбор/перетаскивание файлов в зону, drag&drop переупорядочивания,
 * удаление, назначение обложки. Первое фото — обложка.
 */
'use client';

import { useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Camera, X } from 'lucide-react';
import { PhotoImg } from '@/components/ui/photo-img';

/** Одно фото в загрузчике. */
export interface UploadPhoto {
  id: string;
  url: string;
  /** Исходный File (для multipart-загрузки). Отсутствует у демо-фото. */
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

  /** Добавить выбранные файлы (до 20 всего), создав blob-URL. */
  const onFiles = (files: FileList | null) => {
    if (!files) return;
    const arr = [...files]
      .slice(0, 20)
      .map((f) => ({ id: uid(), url: URL.createObjectURL(f), file: f }));
    setPhotos((p) => [...p, ...arr].slice(0, 20));
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
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => onFiles(e.target.files)}
        />
      </label>

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
