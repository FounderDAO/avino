/**
 * districtIcons — смысловые лайн-иконки районов Ташкента для блока «Популярные
 * места» ({@link ./Districts}).
 *
 * Источник — редакционный SVG-набор (карточки 300×84); отсюда взята ТОЛЬКО
 * векторная иконка (сетка 0–32), без карточки, бейджа и захардкоженного
 * английского текста — название района рендерит компонент из i18n. Цвет обводки
 * заменён на `currentColor` → иконка красится темой (`text-primary`) и корректно
 * работает в тёмном режиме. Ключ — фиксированный UUID района (seed districts),
 * как в `TASHKENT_DISTRICTS`.
 */
import type { ReactElement } from 'react';

const SW = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

const box = {
  className: 'h-[30px] w-[30px]',
  viewBox: '0 0 32 32',
  'aria-hidden': true,
  focusable: false,
} as const;

/** Иконка района по UUID (см. {@link ./Districts}.TASHKENT_DISTRICTS). */
export const DISTRICT_ICONS: Record<string, ReactElement> = {
  // Mirobod — трамвай/поезд
  'd0000000-0000-4000-8000-000000000003': (
    <svg {...box} {...SW}>
      <rect x="5" y="8" width="22" height="12" rx="3" />
      <line x1="5" y1="14" x2="27" y2="14" />
      <rect x="8" y="10" width="3.2" height="2.6" rx="0.6" />
      <rect x="14.4" y="10" width="3.2" height="2.6" rx="0.6" />
      <rect x="20.8" y="10" width="3.2" height="2.6" rx="0.6" />
      <circle cx="10.5" cy="24" r="2" />
      <circle cx="21.5" cy="24" r="2" />
      <line x1="7" y1="24" x2="8.5" y2="24" />
      <line x1="23.5" y1="24" x2="25" y2="24" />
    </svg>
  ),
  // Mirzo Ulug'bek — звезда (залитая)
  'd0000000-0000-4000-8000-000000000004': (
    <svg
      {...box}
      fill="currentColor"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinejoin="round"
    >
      <path d="M16 5 L18.65 12.36 L26.46 12.6 L20.28 17.39 L22.47 24.9 L16 20.5 L9.53 24.9 L11.72 17.39 L5.54 12.6 L13.35 12.36 Z" />
    </svg>
  ),
  // Yunusobod — гора/точка на карте
  'd0000000-0000-4000-8000-000000000012': (
    <svg {...box} {...SW}>
      <line x1="16" y1="3" x2="16" y2="6" />
      <path d="M12.6 12.4 Q16 9 19.4 12.4 Q16 15.8 12.6 12.4 Z" />
      <line x1="16" y1="6" x2="16" y2="24" />
      <path d="M10 28 L16 20 L22 28" />
      <line x1="12" y1="24.5" x2="20" y2="24.5" />
    </svg>
  ),
  // Chilonzor — персонаж/робот
  'd0000000-0000-4000-8000-000000000002': (
    <svg {...box} {...SW}>
      <rect x="8" y="6" width="16" height="18" rx="5" />
      <rect x="10.6" y="9.5" width="4.4" height="4" rx="1" />
      <rect x="17" y="9.5" width="4.4" height="4" rx="1" />
      <circle cx="12" cy="20" r="1.1" />
      <circle cx="20" cy="20" r="1.1" />
      <line x1="11" y1="24" x2="9" y2="28" />
      <line x1="21" y1="24" x2="23" y2="28" />
    </svg>
  ),
  // Shayxontohur — мечеть/купол
  'd0000000-0000-4000-8000-000000000007': (
    <svg {...box} {...SW}>
      <line x1="16" y1="4.5" x2="16" y2="7" />
      <path d="M7 20 A9 9 0 0 1 25 20" />
      <line x1="16" y1="7" x2="16" y2="20" />
      <path d="M10.5 20 A9 9 0 0 1 12.5 10.5" />
      <path d="M21.5 20 A9 9 0 0 0 19.5 10.5" />
      <line x1="6" y1="20" x2="26" y2="20" />
      <line x1="8" y1="20" x2="8" y2="27" />
      <line x1="24" y1="20" x2="24" y2="27" />
      <line x1="6" y1="27" x2="26" y2="27" />
    </svg>
  ),
  // Yakkasaroy — здание и дерево
  'd0000000-0000-4000-8000-000000000009': (
    <svg {...box} {...SW}>
      <rect x="5" y="11" width="11" height="17" />
      <line x1="8.5" y1="15" x2="8.5" y2="15.1" />
      <line x1="12.5" y1="15" x2="12.5" y2="15.1" />
      <line x1="8.5" y1="19" x2="8.5" y2="19.1" />
      <line x1="12.5" y1="19" x2="12.5" y2="19.1" />
      <circle cx="23" cy="14" r="5" />
      <line x1="23" y1="19" x2="23" y2="28" />
      <line x1="4" y1="28" x2="28" y2="28" />
    </svg>
  ),
};
