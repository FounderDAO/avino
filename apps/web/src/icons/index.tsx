// Inline SVG icon set for the admin shell.
//
// TailAdmin (MIT) ships its icons as an SVGR sprite imported from `@/icons`,
// which requires extra webpack wiring. To keep `apps/web` self-contained we
// provide the icons the shell needs as plain React components with the same
// import path. Add more here as later admin pages need them.

import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

const base = (props: IconProps) => ({
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  xmlns: "http://www.w3.org/2000/svg",
  ...props,
});

// Dashboard
export const GridIcon = (props: IconProps) => (
  <svg {...base(props)}>
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
    <rect x="14" y="14" width="7" height="7" rx="1.5" />
  </svg>
);

// Модерация — очередь объявлений
export const ListIcon = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M8 6h13" />
    <path d="M8 12h13" />
    <path d="M8 18h13" />
    <path d="M3 6h.01" />
    <path d="M3 12h.01" />
    <path d="M3 18h.01" />
  </svg>
);

// Жалобы
export const FlagIcon = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M4 21V4a1 1 0 0 1 1-1h11l-2 4 2 4H5" />
  </svg>
);

// Пользователи
export const UsersIcon = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

// Промо (VIP/TOP)
export const StarIcon = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="m12 3 2.6 5.27 5.8.84-4.2 4.1.99 5.79L12 16.27 6.81 19l.99-5.79-4.2-4.1 5.8-.84z" />
  </svg>
);

// Логи
export const DocsIcon = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M14 3v5h5" />
    <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <path d="M8 13h8" />
    <path d="M8 17h8" />
    <path d="M8 9h2" />
  </svg>
);

export const ChevronDownIcon = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="m6 9 6 6 6-6" />
  </svg>
);

export const HorizontaLDots = (props: IconProps) => (
  <svg {...base(props)} fill="currentColor" stroke="none">
    <circle cx="5" cy="12" r="1.6" />
    <circle cx="12" cy="12" r="1.6" />
    <circle cx="19" cy="12" r="1.6" />
  </svg>
);

export const LogoutIcon = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="m16 17 5-5-5-5" />
    <path d="M21 12H9" />
  </svg>
);
