/**
 * DetailMap — реальная карта Яндекса в блоке «На карте» карточки объекта
 * (TASK-196). Переиспользует общий `MapView` (тот же, что на /search и /map),
 * подавая ему ровно один листинг → один пин по координатам объекта.
 *
 * Приватность (ADR-0069/0073): до контакта с автором показываем не точный
 * адрес, а приблизительную зону — поверх пина рисуется радиус-круг
 * `APPROX_RADIUS_M`, а карта кадрируется по нему (overlay-эффект MapView сам
 * вызывает setBounds по кругу), поэтому конкретное здание не выделяется.
 *
 * Карта — только клиент (Yandex JS API требует window): next/dynamic ssr:false
 * живёт здесь, внутри 'use client'-обёртки, как в SearchResults (нельзя
 * ssr:false из серверного Detail.tsx).
 */
'use client';

import dynamic from 'next/dynamic';
import { useLocale } from 'next-intl';
import type { Listing, RadiusCircle } from '@/lib/mock/types';

const MapView = dynamic(() => import('@/features/map/MapView').then((m) => m.MapView), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-[#e8ede9]" />,
});

/** Радиус приблизительной зоны (м) — прячем точный адрес до контакта. */
const APPROX_RADIUS_M = 500;
/** Стартовый зум до того, как overlay-круг скадрирует вид. */
const DETAIL_ZOOM = 15;

export interface DetailMapProps {
  listing: Listing;
}

export function DetailMap({ listing }: DetailMapProps) {
  const locale = useLocale();

  // Без координат карту не рендерим — fallback показывает родитель (Detail.tsx).
  if (listing.lat == null || listing.lng == null) return null;

  const circle: RadiusCircle = {
    lat: listing.lat,
    lng: listing.lng,
    radiusM: APPROX_RADIUS_M,
  };

  return (
    <MapView
      listings={[listing]}
      center={[listing.lat, listing.lng]}
      zoom={DETAIL_ZOOM}
      circle={circle}
      locale={locale}
      autoFit={false}
    />
  );
}
