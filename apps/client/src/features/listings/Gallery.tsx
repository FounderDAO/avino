'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, ImageOff, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ListingMedia } from '@/store/api/listingsApi';

/**
 * Галерея карточки объявления (TASK-153, дизайн-спек §4.3).
 *
 * Hero-изображение (radius 22) + лента превью; клик открывает фуллскрин-лайтбокс
 * (`#0C0C0E`, белые контролы, счётчик, навигация ←/→, закрытие по Esc/клику по
 * фону). Медиа уже приходит упорядоченным по `sort_order` (API.md §8) — порядок
 * не трогаем. Пустой массив → плейсхолдер без фото.
 */

const PLACEHOLDER_BG = 'bg-[#E7E2D8]';

export function Gallery({
  media,
  title,
}: {
  media: ListingMedia[];
  title: string;
}) {
  const [active, setActive] = useState(0);
  const [lightbox, setLightbox] = useState(false);

  const count = media.length;
  const safeActive = Math.min(active, Math.max(count - 1, 0));

  const go = useCallback(
    (dir: 1 | -1) => {
      if (count === 0) return;
      setActive((i) => (i + dir + count) % count);
    },
    [count],
  );

  // Клавиатура работает только при открытом лайтбоксе (Esc / стрелки).
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightbox(false);
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox, go]);

  if (count === 0) {
    return (
      <div
        className={cn(
          'flex aspect-[16/10] w-full items-center justify-center rounded-[22px] text-muted-foreground',
          PLACEHOLDER_BG,
        )}
      >
        <ImageOff className="size-8" aria-hidden="true" />
        <span className="sr-only">Без фото</span>
      </div>
    );
  }

  const current = media[safeActive];

  return (
    <section aria-label="Фотогалерея">
      <button
        type="button"
        onClick={() => setLightbox(true)}
        className={cn(
          'group relative block aspect-[16/10] w-full overflow-hidden rounded-[22px]',
          PLACEHOLDER_BG,
        )}
        aria-label="Открыть фото на весь экран"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- произвольный CDN-хост; next/image требует remotePatterns */}
        <img
          src={current.url}
          alt={title}
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
        />
      </button>

      {count > 1 && (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {media.map((m, i) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setActive(i)}
              className={cn(
                'relative size-20 shrink-0 overflow-hidden rounded-xl border-2 transition-colors',
                PLACEHOLDER_BG,
                i === safeActive
                  ? 'border-primary'
                  : 'border-transparent hover:border-border',
              )}
              aria-label={`Фото ${i + 1}`}
              aria-current={i === safeActive}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- см. выше */}
              <img
                src={m.thumbnail_url ?? m.url}
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
              />
            </button>
          ))}
        </div>
      )}

      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#0C0C0E]"
          role="dialog"
          aria-modal="true"
          aria-label="Просмотр фото"
          onClick={() => setLightbox(false)}
        >
          <button
            type="button"
            onClick={() => setLightbox(false)}
            className="absolute right-4 top-4 rounded-full p-2 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="Закрыть"
          >
            <X className="size-6" />
          </button>

          <span className="absolute left-1/2 top-5 -translate-x-1/2 text-sm font-semibold text-white/80">
            {safeActive + 1} / {count}
          </span>

          {count > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  go(-1);
                }}
                className="absolute left-4 rounded-full p-2 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
                aria-label="Предыдущее фото"
              >
                <ChevronLeft className="size-8" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  go(1);
                }}
                className="absolute right-4 rounded-full p-2 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
                aria-label="Следующее фото"
              >
                <ChevronRight className="size-8" />
              </button>
            </>
          )}

          {/* eslint-disable-next-line @next/next/no-img-element -- см. выше */}
          <img
            src={current.url}
            alt={title}
            className="max-h-[90vh] max-w-[92vw] object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </section>
  );
}
