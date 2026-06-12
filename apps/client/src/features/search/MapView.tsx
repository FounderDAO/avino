/**
 * MapView — настоящая карта Leaflet с брендовыми ценовыми пинами.
 *
 * Перенос map.jsx на react-leaflet/Leaflet. Карта работает только на клиенте
 * ('use client' + гард typeof window), импортирует CSS Leaflet. Тайлы — OSM,
 * центр Ташкент, ценовые пины (divIcon) c подсветкой активного листинга.
 *
 * Production-note: при переходе на Yandex Maps JS API (SPEC §2) меняется
 * только этот файл; пропсы (listings/activeId/onSelect/onHover) стабильны.
 */
'use client';

import * as React from 'react';
import L from 'leaflet';
import { useTranslations } from 'next-intl';
import { pinPrice, type T } from '@/lib/format';
import type { Listing } from '@/lib/mock/types';

import 'leaflet/dist/leaflet.css';

export interface MapViewProps {
  listings: Listing[];
  /** id подсвеченного листинга (связь со списком). */
  activeId?: string | null;
  onSelect?: (id: string) => void;
  onHover?: (id: string | null) => void;
}

/** Центр карты по умолчанию — Ташкент. */
const TASHKENT_CENTER: [number, number] = [41.311, 69.28];
const DEFAULT_ZOOM = 12;

/** HTML ценового пина (divIcon): VIP — золотой, TOP — красный, активный — тёмный. */
function pinHTML(listing: Listing, active: boolean, t: T): string {
  const price = pinPrice(listing, t);
  let bg = '#fff';
  let fg = 'var(--ink, #282218)';
  let bd = '1.5px solid var(--border, #e7e2d8)';
  if (listing.promo === 'VIP') {
    bg = 'linear-gradient(135deg,#D9A53C,#B8862A)';
    fg = '#fff';
    bd = 'none';
  } else if (listing.promo === 'TOP') {
    bg = 'var(--red, #e03c42)';
    fg = '#fff';
    bd = 'none';
  }
  if (active) {
    bg = 'var(--ink, #282218)';
    fg = '#fff';
    bd = 'none';
  }
  return `<div class="av-pin ${active ? 'active' : ''}" style="background:${bg};color:${fg};border:${bd}">${price}</div>`;
}

/** Стили пинов (инжектим один раз, т.к. это не Tailwind, а Leaflet-divIcon). */
const PIN_STYLE_ID = 'avino-leaflet-pins';
function ensurePinStyles() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(PIN_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = PIN_STYLE_ID;
  style.textContent = `
    .leaflet-div-icon { background: transparent !important; border: none !important; }
    .av-pin {
      transform: translate(-50%, -50%);
      padding: 5px 11px; border-radius: 999px;
      font-size: 13px; font-weight: 800; white-space: nowrap;
      box-shadow: 0 3px 10px rgba(40,34,24,.32);
      cursor: pointer; transition: transform .12s ease;
    }
    .av-pin:hover { transform: translate(-50%, -50%) scale(1.08); }
    .av-pin.active { transform: translate(-50%, -50%) scale(1.12); z-index: 1000; }
    .leaflet-container { font-family: inherit; background: #e8ede9; }
  `;
  document.head.appendChild(style);
}

export function MapView({ listings, activeId, onSelect, onHover }: MapViewProps) {
  const tUnits = useTranslations('units');
  const tSearch = useTranslations('search');
  const elRef = React.useRef<HTMLDivElement | null>(null);
  const mapRef = React.useRef<L.Map | null>(null);
  const markersRef = React.useRef<Record<string, L.Marker>>({});

  // Свежие колбэки в ref, чтобы не пересоздавать маркеры при смене пропсов.
  const onSelectRef = React.useRef(onSelect);
  const onHoverRef = React.useRef(onHover);
  onSelectRef.current = onSelect;
  onHoverRef.current = onHover;

  // Инициализация карты (один раз, только на клиенте).
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!elRef.current || mapRef.current) return;
    ensurePinStyles();

    const map = L.map(elRef.current, {
      zoomControl: false,
      attributionControl: false,
    }).setView(TASHKENT_CENTER, DEFAULT_ZOOM);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      subdomains: 'abc',
    }).addTo(map);

    L.control.zoom({ position: 'bottomright' }).addTo(map);
    L.control
      .attribution({ position: 'bottomleft', prefix: false })
      .addAttribution('© OpenStreetMap')
      .addTo(map);

    mapRef.current = map;
    setTimeout(() => map.invalidateSize(), 100);

    return () => {
      map.remove();
      mapRef.current = null;
      markersRef.current = {};
    };
  }, []);

  // (Пере)строение маркеров при смене набора листингов.
  const listingsKey = listings.map((l) => l.id).join(',');
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.invalidateSize();

    Object.values(markersRef.current).forEach((m) => map.removeLayer(m));
    markersRef.current = {};

    const pts: [number, number][] = [];
    listings.forEach((l) => {
      if (l.lat == null || l.lng == null) return;
      pts.push([l.lat, l.lng]);
      const icon = L.divIcon({
        className: 'av-pin-wrap',
        html: pinHTML(l, l.id === activeId, tUnits),
        iconSize: undefined,
        iconAnchor: [0, 0],
      });
      const marker = L.marker([l.lat, l.lng], { icon, riseOnHover: true }).addTo(map);
      marker.on('click', () => onSelectRef.current?.(l.id));
      marker.on('mouseover', () => onHoverRef.current?.(l.id));
      marker.on('mouseout', () => onHoverRef.current?.(null));
      markersRef.current[l.id] = marker;
    });

    setTimeout(() => {
      map.invalidateSize();
      if (pts.length === 1) {
        map.setView(pts[0], 15);
      } else if (pts.length > 1) {
        try {
          map.fitBounds(pts, { padding: [50, 50], maxZoom: 14 });
        } catch {
          /* пустые границы — оставляем дефолтный вид */
        }
      }
    }, 80);
    // activeId намеренно не в зависимостях: подсветка — отдельным эффектом.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listingsKey]);

  // Подсветка активного пина без перестроения всех маркеров.
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    listings.forEach((l) => {
      const marker = markersRef.current[l.id];
      if (!marker) return;
      marker.setIcon(
        L.divIcon({
          className: 'av-pin-wrap',
          html: pinHTML(l, l.id === activeId, tUnits),
          iconSize: undefined,
          iconAnchor: [0, 0],
        }),
      );
      if (l.id === activeId) {
        marker.setZIndexOffset(1000);
        if (l.lat != null && l.lng != null) map.panTo([l.lat, l.lng], { animate: true });
      } else {
        marker.setZIndexOffset(0);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  return (
    <div
      ref={elRef}
      className="h-full w-full bg-[#e8ede9]"
      role="img"
      aria-label={tSearch('map.ariaLabel')}
    />
  );
}
