// apps/web/src/components/admin/listing-import/FolderPicker.tsx
'use client';

import { useRef } from 'react';

const IMAGE_EXT = /\.(jpe?g|png|webp|heic)$/i;

/**
 * Выбор папки (`webkitdirectory`) или отдельных файлов с фото. Файлы остаются в
 * памяти вкладки; из папки берём только изображения (HEIC — чтобы показать
 * подсказку «конвертируйте»).
 */
export function FolderPicker({ files, onChange, disabled }: { files: File[]; onChange: (files: File[]) => void; disabled?: boolean }) {
  const folderRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef<HTMLInputElement>(null);
  const pick = (list: FileList | null) => onChange(Array.from(list ?? []).filter((f) => IMAGE_EXT.test(f.name)));
  return (
    <div className="row gap-8" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
      <input
        ref={folderRef}
        type="file"
        hidden
        multiple
        // Нестандартный атрибут: React пропускает его как есть.
        {...({ webkitdirectory: '' } as Record<string, string>)}
        onChange={(e) => {
          pick(e.target.files);
          e.target.value = '';
        }}
      />
      <input
        ref={filesRef}
        type="file"
        hidden
        multiple
        accept="image/jpeg,image/png,image/webp"
        onChange={(e) => {
          pick(e.target.files);
          e.target.value = '';
        }}
      />
      <button className="abtn abtn-outline" disabled={disabled} onClick={() => folderRef.current?.click()}>Выбрать папку с фото</button>
      <button className="abtn abtn-ghost" disabled={disabled} onClick={() => filesRef.current?.click()}>Выбрать файлы</button>
      <span style={{ fontSize: 13, color: 'var(--muted)' }}>
        {files.length > 0 ? `Выбрано фото: ${files.length}` : 'Нужно, если в колонке «Фото» указаны имена файлов'}
      </span>
    </div>
  );
}
