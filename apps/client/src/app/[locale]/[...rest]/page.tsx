/**
 * Catch-all для несуществующих путей под /[locale] (напр. /ru/mortgage).
 * Без этого файла Next.js отдавал бы дефолтную 404 в обход layout'а
 * (без Header/Footer/локализации). notFound() поднимает ближайший
 * not-found.tsx — это [locale]/not-found.tsx, рендерящийся внутри layout.
 */
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

// Явный noindex (Next и так добавляет его к 404) — на случай смены поведения.
export const metadata: Metadata = { robots: { index: false, follow: true } };

export default function CatchAll() {
  notFound();
}
