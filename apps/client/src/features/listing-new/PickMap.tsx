/**
 * PickMap — выбор точки на карте-ЗАГЛУШКЕ (БЕЗ реального Leaflet).
 * Чисто визуально: стилизованный фон «карты» (сетка улиц + блоки кварталов),
 * клик ставит маркер, маркер можно перетаскивать. Пиксельная позиция
 * проецируется в псевдо-координаты вокруг центра Ташкента (41.311, 69.28).
 */
'use client';

import { useRef, useState } from 'react';
import { MapPin } from 'lucide-react';

/** Координаты [lat, lng]. */
export type Coords = [number, number];

export interface PickMapProps {
  value: Coords | null;
  onChange: (coords: Coords) => void;
}

/** Центр карты (Ташкент) и масштаб проекции «пиксель → градус». */
const CENTER: Coords = [41.311, 69.28];
const SPAN = 0.06; // разброс координат на всю ширину/высоту карты

/** Проекция доли [0..1] по осям в псевдо-координаты вокруг центра. */
function project(fx: number, fy: number): Coords {
  const lng = +(CENTER[1] + (fx - 0.5) * SPAN).toFixed(5);
  const lat = +(CENTER[0] - (fy - 0.5) * SPAN).toFixed(5);
  return [lat, lng];
}

export function PickMap({ value, onChange }: PickMapProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  // Позиция маркера в долях [0..1] — для отрисовки. null до первого клика.
  const [pos, setPos] = useState<{ x: number; y: number } | null>(value ? { x: 0.5, y: 0.5 } : null);
  const dragging = useRef(false);

  /** Обработать указатель: вычислить долю в пределах карты и обновить точку. */
  const place = (clientX: number, clientY: number) => {
    const box = boxRef.current;
    if (!box) return;
    const r = box.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    const y = Math.min(1, Math.max(0, (clientY - r.top) / r.height));
    setPos({ x, y });
    onChange(project(x, y));
  };

  return (
    <div>
      <div
        ref={boxRef}
        onClick={(e) => place(e.clientX, e.clientY)}
        onPointerMove={(e) => {
          if (dragging.current) place(e.clientX, e.clientY);
        }}
        onPointerUp={() => (dragging.current = false)}
        className="relative h-[300px] cursor-crosshair overflow-hidden rounded-input border border-border bg-[#e9eee7]"
      >
        {/* Псевдо-кварталы */}
        <div className="absolute inset-0 opacity-70">
          <div className="absolute left-[8%] top-[12%] h-[22%] w-[26%] rounded-[6px] bg-[#dde6da]" />
          <div className="absolute left-[42%] top-[8%] h-[30%] w-[22%] rounded-[6px] bg-[#dde6da]" />
          <div className="absolute left-[70%] top-[18%] h-[26%] w-[22%] rounded-[6px] bg-[#dde6da]" />
          <div className="absolute left-[14%] top-[50%] h-[28%] w-[30%] rounded-[6px] bg-[#dde6da]" />
          <div className="absolute left-[56%] top-[56%] h-[30%] w-[28%] rounded-[6px] bg-[#dde6da]" />
          {/* «Зелёный массив» */}
          <div className="absolute left-[30%] top-[34%] h-[18%] w-[16%] rounded-full bg-[#cfe3c6]" />
        </div>
        {/* Сетка улиц */}
        <div
          className="absolute inset-0 opacity-60"
          style={{
            backgroundImage:
              'linear-gradient(#f4f6f2 2px, transparent 2px), linear-gradient(90deg, #f4f6f2 2px, transparent 2px)',
            backgroundSize: '64px 64px',
          }}
        />
        {/* Диагональная «магистраль» */}
        <div className="absolute left-[-10%] top-[64%] h-[10px] w-[120%] -rotate-6 bg-[#f4f6f2]" />

        {/* Маркер */}
        {pos && (
          <button
            type="button"
            aria-label="Точка объекта"
            onPointerDown={(e) => {
              e.stopPropagation();
              dragging.current = true;
            }}
            onClick={(e) => e.stopPropagation()}
            style={{ left: `${pos.x * 100}%`, top: `${pos.y * 100}%` }}
            className="absolute -translate-x-1/2 -translate-y-full cursor-grab text-red drop-shadow-md active:cursor-grabbing"
          >
            <MapPin size={36} strokeWidth={2} className="fill-red text-white" />
          </button>
        )}

        {!pos && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="rounded-pill bg-surface/90 px-3.5 py-1.5 text-[13px] font-semibold text-ink shadow-card">
              Кликните на карте, чтобы поставить точку
            </span>
          </div>
        )}
      </div>
      <p className="mt-2 text-[13px] text-muted-foreground">
        {value ? (
          <>
            Точка на карте: <b className="text-ink">{value[0]}, {value[1]}</b>
          </>
        ) : (
          'Кликните на карте, чтобы поставить точку объекта (координаты берутся только с карты).'
        )}
      </p>
    </div>
  );
}
