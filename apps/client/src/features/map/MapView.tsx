/**
 * MapView — карта объявлений на Yandex Maps JS API 2.1 (CLAUDE.md §12).
 *
 * Заменяет прежний Leaflet+OSM MapView. Один компонент обслуживает два экрана,
 * пропсы списка↔карты стабильны (`listings/activeId/onSelect/onHover`):
 *  - /search — радиусный поиск: оверлей-круг (`circle`) + рисование радиуса
 *    (`drawMode='radius'`, зажал-потянул-отпустил → `onDrawComplete`);
 *  - /map    — поиск по карте: рисование территории (`drawMode='polygon'`,
 *    клики-вершины + `finishSignal` → `onPolygonComplete`), оверлей территории
 *    (`polygon`) и отчёт о видимой области (`onBoundsChange`, debounce).
 *
 * Маркеры — кластеризуются (ymaps.Clusterer). Пины брендовые (ADR-0060): VIP
 * золотой, TOP красный, активный — тёмный (ink). Клик по пину → `onSelect`,
 * наведение → `onHover`; активный пин подсвечивается и карта к нему панорамируется.
 *
 * Только клиент ('use client' + next/dynamic ssr:false на месте использования).
 * `ymaps` — внешний глобал (any), вся работа с ним инкапсулирована здесь.
 */
'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { pinPrice, type T } from '@/lib/format';
import { clampRadius, type LatLng, type LatLngBounds } from '@/lib/geo';
import type { Listing, RadiusCircle } from '@/lib/mock/types';
import { useYmaps, type Ymaps, type YmapsStatus } from './useYmaps';

export type DrawMode = 'radius' | 'polygon' | null;

export interface MapViewProps {
  listings: Listing[];
  /** id подсвеченного листинга (связь со списком). */
  activeId?: string | null;
  onSelect?: (id: string) => void;
  onHover?: (id: string | null) => void;
  /** Язык интерфейса (для языка SDK Yandex). */
  locale?: string;
  /** Центр по умолчанию (иначе Ташкент). */
  center?: LatLng;
  zoom?: number;

  // ── /search: радиус ──
  /** Активный круг радиусного поиска (из URL) — рисуется поверх карты. */
  circle?: RadiusCircle | null;
  onDrawComplete?: (circle: RadiusCircle) => void;

  // ── /map: территория + видимая область ──
  /** Зафиксированный полигон территории — рисуется поверх карты. */
  polygon?: LatLng[] | null;
  /** Готовность полигона: рост счётчика завершает текущее рисование. */
  finishSignal?: number;
  onPolygonComplete?: (points: LatLng[]) => void;
  /** Прогресс рисования (число поставленных вершин). */
  onPolygonProgress?: (count: number) => void;
  /** Видимая область карты (debounce). Эмитится только без активного draw/polygon. */
  onBoundsChange?: (bounds: LatLngBounds) => void;

  /** Текущий режим рисования. */
  drawMode?: DrawMode;
  /** Автоподгон вида под маркеры при смене набора (true на /search, false на /map). */
  autoFit?: boolean;
}

/** Центр карты по умолчанию — Ташкент. */
const TASHKENT_CENTER: LatLng = [41.311, 69.28];
const DEFAULT_ZOOM = 12;
const BOUNDS_DEBOUNCE_MS = 450;

/** Стиль оверлеев (круг радиуса и территория) — тёмный ink, как в прежнем MapView. */
const OVERLAY_STYLE = {
  strokeColor: '#282218',
  strokeWidth: 2,
  fillColor: '#28221814',
  fillOpacity: 0.08,
} as const;

/** HTML ценового пина: VIP — золотой, TOP — красный, активный — тёмный. */
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
  return `<div class="av-ypin ${active ? 'active' : ''}" style="background:${bg};color:${fg};border:${bd}">${price}</div>`;
}

/** Стили пинов (инжектим один раз — это сырой HTML внутри iconLayout, не Tailwind). */
const PIN_STYLE_ID = 'avino-ymaps-pins';
function ensurePinStyles() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(PIN_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = PIN_STYLE_ID;
  style.textContent = `
    .av-ypin {
      position: absolute; transform: translate(-50%, -50%);
      padding: 5px 11px; border-radius: 999px;
      font-size: 13px; font-weight: 800; white-space: nowrap;
      box-shadow: 0 3px 10px rgba(40,34,24,.32);
      cursor: pointer; transition: transform .12s ease; line-height: 1;
    }
    .av-ypin:hover { transform: translate(-50%, -50%) scale(1.08); }
    .av-ypin.active { transform: translate(-50%, -50%) scale(1.12); z-index: 1000; }
  `;
  document.head.appendChild(style);
}

/** Кэш классов iconLayout по html — чтобы не пересоздавать на каждый рендер. */
function makeIconLayout(ymaps: Ymaps, html: string): any {
  return ymaps.templateLayoutFactory.createClass(html);
}

export function MapView({
  listings,
  activeId,
  onSelect,
  onHover,
  locale,
  center = TASHKENT_CENTER,
  zoom = DEFAULT_ZOOM,
  circle,
  onDrawComplete,
  polygon,
  finishSignal,
  onPolygonComplete,
  onPolygonProgress,
  onBoundsChange,
  drawMode = null,
  autoFit = false,
}: MapViewProps) {
  const tUnits = useTranslations('units');
  const tSearch = useTranslations('search');
  const { ymaps, status } = useYmaps(locale);

  const elRef = React.useRef<HTMLDivElement | null>(null);
  const mapRef = React.useRef<any>(null);
  const clustererRef = React.useRef<any>(null);
  const placemarksRef = React.useRef<Record<string, any>>({});
  const overlayRef = React.useRef<any>(null); // активный circle/polygon оверлей
  const drawTmpRef = React.useRef<any>(null); // временная геометрия рисования

  // Свежие колбэки/значения в ref — не пересоздаём карту/маркеры зря.
  const cb = React.useRef({ onSelect, onHover, onDrawComplete, onPolygonComplete, onPolygonProgress, onBoundsChange });
  cb.current = { onSelect, onHover, onDrawComplete, onPolygonComplete, onPolygonProgress, onBoundsChange };
  const circleRef = React.useRef(circle);
  const polygonRef = React.useRef(polygon);
  const drawModeRef = React.useRef(drawMode);
  circleRef.current = circle;
  polygonRef.current = polygon;
  drawModeRef.current = drawMode;

  // ── Инициализация карты (один раз, когда ymaps готов) ──
  React.useEffect(() => {
    if (!ymaps || !elRef.current || mapRef.current) return;
    ensurePinStyles();

    const map = new ymaps.Map(
      elRef.current,
      { center, zoom, controls: ['zoomControl', 'geolocationControl'] },
      { suppressMapOpenBlock: true, yandexMapDisablePoiInteractivity: true },
    );
    const clusterer = new ymaps.Clusterer({
      groupByCoordinates: false,
      clusterDisableClickZoom: false,
      gridSize: 72,
      preset: 'islands#invertedRedClusterIcons',
    });
    map.geoObjects.add(clusterer);
    mapRef.current = map;
    clustererRef.current = clusterer;

    // Видимая область → onBoundsChange (debounce), только когда не рисуем и нет
    // зафиксированной территории (иначе область считает MapSearch по полигону).
    let timer: ReturnType<typeof setTimeout> | null = null;
    map.events.add('boundschange', () => {
      if (drawModeRef.current || polygonRef.current) return;
      if (!cb.current.onBoundsChange) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const b = map.getBounds(); // [[swLat,swLng],[neLat,neLng]]
        if (!b) return;
        cb.current.onBoundsChange?.({
          swLat: b[0][0], swLng: b[0][1], neLat: b[1][0], neLng: b[1][1],
        });
      }, BOUNDS_DEBOUNCE_MS);
    });

    return () => {
      if (timer) clearTimeout(timer);
      map.destroy();
      mapRef.current = null;
      clustererRef.current = null;
      placemarksRef.current = {};
      overlayRef.current = null;
      drawTmpRef.current = null;
    };
    // center/zoom — только начальные; намеренно не в deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ymaps]);

  // ── (Пере)строение маркеров при смене набора листингов ──
  const listingsKey = listings.map((l) => l.id).join(',');
  React.useEffect(() => {
    const map = mapRef.current;
    const clusterer = clustererRef.current;
    if (!map || !clusterer || !ymaps) return;

    clusterer.removeAll();
    placemarksRef.current = {};

    const placemarks: any[] = [];
    listings.forEach((l) => {
      if (l.lat == null || l.lng == null) return;
      const pm = new ymaps.Placemark(
        [l.lat, l.lng],
        { listingId: l.id },
        {
          iconLayout: makeIconLayout(ymaps, pinHTML(l, l.id === activeId, tUnits)),
          iconShape: { type: 'Rectangle', coordinates: [[-46, -16], [46, 16]] },
        },
      );
      pm.events.add('click', () => cb.current.onSelect?.(l.id));
      pm.events.add('mouseenter', () => cb.current.onHover?.(l.id));
      pm.events.add('mouseleave', () => cb.current.onHover?.(null));
      placemarksRef.current[l.id] = pm;
      placemarks.push(pm);
    });
    clusterer.add(placemarks);

    // Автоподгон вида: только на /search и только без активного оверлея.
    if (autoFit && !circleRef.current && !polygonRef.current && placemarks.length) {
      try {
        map.setBounds(clusterer.getBounds(), { checkZoomRange: true, zoomMargin: 48 });
      } catch {
        /* пустые границы — оставляем текущий вид */
      }
    }
    // activeId — отдельным эффектом (подсветка без перестроения).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listingsKey, ymaps, autoFit]);

  // ── Подсветка активного пина + панорамирование (без перестроения) ──
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map || !ymaps) return;
    listings.forEach((l) => {
      const pm = placemarksRef.current[l.id];
      if (!pm) return;
      pm.options.set('iconLayout', makeIconLayout(ymaps, pinHTML(l, l.id === activeId, tUnits)));
      pm.options.set('zIndex', l.id === activeId ? 1000 : 0);
    });
    if (activeId) {
      const a = listings.find((l) => l.id === activeId);
      if (a?.lat != null && a?.lng != null) map.panTo([a.lat, a.lng], { flying: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, ymaps]);

  // ── Оверлей: круг радиуса (/search) или территория (/map) ──
  const overlayKey = circle
    ? `c:${circle.lat},${circle.lng},${circle.radiusM}`
    : polygon
      ? `p:${polygon.length}:${polygon[0]?.join(',') ?? ''}`
      : '';
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map || !ymaps) return;
    if (overlayRef.current) {
      map.geoObjects.remove(overlayRef.current);
      overlayRef.current = null;
    }
    if (circle) {
      const c = new ymaps.Circle([[circle.lat, circle.lng], circle.radiusM], {}, { ...OVERLAY_STYLE, interactivityModel: 'default#transparent' });
      map.geoObjects.add(c);
      overlayRef.current = c;
      try {
        map.setBounds(c.geometry.getBounds(), { checkZoomRange: true, zoomMargin: 40 });
      } catch {
        /* no-op */
      }
    } else if (polygon && polygon.length >= 3) {
      const p = new ymaps.Polygon([[...polygon, polygon[0]]], {}, { ...OVERLAY_STYLE, interactivityModel: 'default#transparent' });
      map.geoObjects.add(p);
      overlayRef.current = p;
      try {
        map.setBounds(p.geometry.getBounds(), { checkZoomRange: true, zoomMargin: 48 });
      } catch {
        /* no-op */
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlayKey, ymaps]);

  // ── Рисование РАДИУСА (/search): зажал центр → потянул → отпустил ──
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map || !ymaps || drawMode !== 'radius') return;

    map.behaviors.disable('drag');
    let center: LatLng | null = null;
    let preview: any = null;

    const onDown = (e: any) => {
      center = e.get('coords');
      preview = new ymaps.Circle([center, 0], {}, OVERLAY_STYLE);
      map.geoObjects.add(preview);
      drawTmpRef.current = preview;
    };
    const onMove = (e: any) => {
      if (!center || !preview) return;
      const r = ymaps.coordSystem.geo.getDistance(center, e.get('coords'));
      preview.geometry.setRadius(Math.min(50000, r));
    };
    const onUp = () => {
      if (!center || !preview) return;
      const radiusM = clampRadius(preview.geometry.getRadius());
      const [lat, lng] = center;
      map.geoObjects.remove(preview);
      drawTmpRef.current = null;
      center = null;
      preview = null;
      cb.current.onDrawComplete?.({ lat, lng, radiusM });
    };

    map.events.add('mousedown', onDown);
    map.events.add('mousemove', onMove);
    map.events.add('mouseup', onUp);
    return () => {
      map.events.remove('mousedown', onDown);
      map.events.remove('mousemove', onMove);
      map.events.remove('mouseup', onUp);
      if (preview) map.geoObjects.remove(preview);
      drawTmpRef.current = null;
      map.behaviors.enable('drag');
    };
  }, [drawMode, ymaps]);

  // ── Рисование ТЕРРИТОРИИ (/map): клики-вершины, finishSignal замыкает ──
  const pointsRef = React.useRef<LatLng[]>([]);
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map || !ymaps || drawMode !== 'polygon') return;

    pointsRef.current = [];
    cb.current.onPolygonProgress?.(0);
    const shape = new ymaps.Polygon([[]], {}, { ...OVERLAY_STYLE, editorDrawingCursor: 'crosshair' });
    map.geoObjects.add(shape);
    drawTmpRef.current = shape;

    const redraw = () => {
      const pts = pointsRef.current;
      const ring = pts.length >= 3 ? [...pts, pts[0]] : pts;
      shape.geometry.setCoordinates([ring]);
    };
    const onClick = (e: any) => {
      pointsRef.current = [...pointsRef.current, e.get('coords') as LatLng];
      redraw();
      cb.current.onPolygonProgress?.(pointsRef.current.length);
    };
    map.events.add('click', onClick);

    return () => {
      map.events.remove('click', onClick);
      // Снимаем временную фигуру: зафиксированную территорию отрисует оверлей-эффект.
      if (drawTmpRef.current) {
        map.geoObjects.remove(drawTmpRef.current);
        drawTmpRef.current = null;
      }
    };
  }, [drawMode, ymaps]);

  // finishSignal: замкнуть текущую территорию (≥3 вершин) → onPolygonComplete.
  const prevFinish = React.useRef(finishSignal);
  React.useEffect(() => {
    if (finishSignal === prevFinish.current) return;
    prevFinish.current = finishSignal;
    if (drawModeRef.current !== 'polygon') return;
    const pts = pointsRef.current;
    if (pts.length >= 3) cb.current.onPolygonComplete?.(pts);
  }, [finishSignal]);

  // ── Деградация без ключа/при ошибке: подсказка вместо карты ──
  if (status !== 'ready') {
    return (
      <div
        className="flex h-full w-full items-center justify-center bg-[#e8ede9] p-6 text-center text-sm text-muted-foreground"
        role="img"
        aria-label={tSearch('map.ariaLabel')}
      >
        {status === 'no-key'
          ? tSearch('map.missingKey')
          : status === 'error'
            ? tSearch('map.loadError')
            : tSearch('map.loading')}
      </div>
    );
  }

  return (
    <div
      ref={elRef}
      className="h-full w-full bg-[#e8ede9]"
      role="img"
      aria-label={tSearch('map.ariaLabel')}
    />
  );
}

export type { YmapsStatus };
