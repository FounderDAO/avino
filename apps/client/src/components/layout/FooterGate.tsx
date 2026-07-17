/**
 * FooterGate — глобальный футер по маршруту.
 *
 * /map и /search — «фиксированные» страницы (Zillow-сплит, спека 2026-07-17):
 * сплит занимает ровно высоту вьюпорта, скроллится только колонка списка, а
 * компактный футер рендерится внутри неё (<Footer variant="panel" />). Глобальный
 * футер на этих страницах скрываем: иначе документ выше вьюпорта, и body-скролл
 * увозит панель «Нарисовать территорию» за экран.
 */
'use client';

import { usePathname } from '@/i18n/navigation';
import { Footer } from './Footer';

/** Маршруты без глобального футера (путь без префикса локали, точное совпадение). */
const FULLSCREEN_PATHS = ['/map', '/search'];

export function FooterGate() {
  const pathname = usePathname();
  if (FULLSCREEN_PATHS.includes(pathname)) return null;
  return <Footer />;
}
