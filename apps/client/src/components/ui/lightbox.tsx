/**
 * Lightbox — полноэкранный просмотр фото с навигацией.
 * Управляется индексом; стрелки/клавиатура листают, клик по фону закрывает.
 * TASK-198: добавлен touch-свайп (touchstart/touchend, порог 40px → prev/next).
 *
 * Рендерится через portal в document.body: на странице detail обёртка имеет
 * класс `.fade-up` (animation с transform + fill-mode both), который создаёт
 * containing block для position:fixed. Без портала `fixed inset-0` растягивался
 * бы на всю высоту страницы (≈1600px), а не на вьюпорт — модалка «слишком
 * длинная» и не центрирована. Портал выносит оверлей из-под трансформа.
 */
'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { PhotoImg } from './photo-img';
import type { ListingPhoto } from '@/lib/mock/types';

export interface LightboxProps {
  photos: ListingPhoto[];
  /** Текущий индекс. */
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  alt?: string;
}

/** Минимальный горизонтальный сдвиг (px) для регистрации свайпа. */
const SWIPE_THRESHOLD = 40;

export function Lightbox({ photos, index, onIndexChange, onClose, alt }: LightboxProps) {
  const t = useTranslations('common');
  const total = photos.length;
  const prev = React.useCallback(
    () => onIndexChange((index - 1 + total) % total),
    [index, total, onIndexChange],
  );
  const next = React.useCallback(
    () => onIndexChange((index + 1) % total),
    [index, total, onIndexChange],
  );

  // ── Клавиатурная навигация ────────────────────────────────────────────────
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'ArrowRight') next();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, prev, next]);

  // ── Блокировка прокрутки фона, пока лайтбокс открыт ───────────────────────
  React.useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // ── Touch-свайп ───────────────────────────────────────────────────────────
  const touchStartX = React.useRef<number | null>(null);

  const handleTouchStart = React.useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  }, []);

  const handleTouchEnd = React.useCallback(
    (e: React.TouchEvent) => {
      if (touchStartX.current === null) return;
      const delta = e.changedTouches[0].clientX - touchStartX.current;
      touchStartX.current = null;
      if (Math.abs(delta) < SWIPE_THRESHOLD) return;
      // Свайп влево → следующее фото; вправо → предыдущее.
      if (delta < 0) next();
      else prev();
    },
    [prev, next],
  );

  if (!photos[index]) return null;
  // SSR-guard: портал требует document. Лайтбокс открывается только на клиенте,
  // но проверка делает компонент безопасным при любом серверном проходе.
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      onClick={onClose}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/90 p-4"
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label={t('close')}
        className="absolute right-5 top-5 text-white/80 hover:text-white"
      >
        <X size={28} />
      </button>

      {total > 1 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            prev();
          }}
          aria-label={t('previous')}
          className="absolute left-4 flex h-12 w-12 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25"
        >
          <ChevronLeft size={26} />
        </button>
      )}

      <PhotoImg
        src={photos[index].url}
        alt={alt}
        // min-* — пол размера, чтобы битое/отсутствующее фото показывалось
        // осмысленной брендовой карточкой, а не крошечным глифом. Для реальных
        // фото пол ниже типичного fit-размера и не влияет (прозрачные поля над
        // чёрным оверлеем не видны).
        className="max-h-[88vh] min-h-[280px] w-auto min-w-[280px] max-w-[92vw] rounded-card object-contain"
        onClick={(e) => e.stopPropagation()}
      />

      {total > 1 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            next();
          }}
          aria-label={t('next')}
          className="absolute right-4 flex h-12 w-12 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25"
        >
          <ChevronRight size={26} />
        </button>
      )}

      <div className="absolute bottom-5 text-sm font-semibold text-white/80">
        {index + 1} / {total}
      </div>
    </div>,
    document.body,
  );
}
