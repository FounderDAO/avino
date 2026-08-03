/**
 * Catch-all для несуществующих путей под /[locale] (напр. /ru/mortgage).
 * Без этого файла Next.js отдавал бы дефолтную 404 в обход layout'а
 * (без Header/Footer/локализации). notFound() поднимает ближайший
 * not-found.tsx — это [locale]/not-found.tsx, рендерящийся внутри layout.
 */
import { notFound } from 'next/navigation';

export default function CatchAll() {
  notFound();
}
