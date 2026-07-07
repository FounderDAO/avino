/**
 * MapView — карта объявлений на Yandex Maps JS API 2.1 (CLAUDE.md §12).
 *
 * Заменяет прежний Leaflet+OSM MapView. Один компонент обслуживает два экрана,
 * пропсы списка↔карты стабильны (`listings/activeId/onSelect/onHover`):
 *  - /search — радиусный поиск: оверлей-круг (`circle`) + рисование радиуса
 *    (`drawMode='radius'`, зажал-потянул-отпустил → `onDrawComplete`);
 *  - /map    — поиск по карте: freehand-лассо территории (`drawMode='polygon'`,
 *    зажал → обвёл → отпустил → `onPolygonComplete`), оверлей территории
 *    (`polygon`) и отчёт о видимой области (`onBoundsChange`, debounce).
 *
 * Маркеры — кластеризуются (ymaps.Clusterer). Пины брендовые (ADR-0060):
 * аренда — оранжевые, продажа — красные, активный — тёмный (ink). Клик по пину → `onSelect`,
 * наведение → `onHover`; активный пин подсвечивается, центрирование карты —
 * опционально (admin-флаг recenterOnHover).
 *
 * Только клиент ('use client' + next/dynamic ssr:false на месте использования).
 * `ymaps` — внешний глобал (any), вся работа с ним инкапсулирована здесь.
 */
'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { usePriceFormatter } from '@/lib/usePriceFormatter';
import { clampRadius, type LatLng, type LatLngBounds } from '@/lib/geo';
import type { Listing, RadiusCircle, TransactionType } from '@/lib/mock/types';
import { useYmaps, type Ymaps, type YmapsStatus } from './useYmaps';

export type DrawMode = 'radius' | 'polygon' | null;

/** Превью пина (Zillow): карточка позиционируется у кликнутого пина. */
export interface MapPreviewAnchor {
  /** id листинга, к чьему пину крепится карточка (координаты берём из listings). */
  listingId: string;
  /** Содержимое карточки (обычно MapPreviewCard). */
  node: React.ReactNode;
}

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
  /** Замкнутая freehand-территория (зажал → обвёл → отпустил). */
  onPolygonComplete?: (points: LatLng[]) => void;
  /** Прогресс freehand-рисования (число точек обводки; 0 — рисование сброшено). */
  onPolygonProgress?: (count: number) => void;
  /** Видимая область карты (debounce). Эмитится только без активного draw/polygon.
   *  meta.user=true — изменению предшествовал жест пользователя (drag/wheel/зум-контролы),
   *  false — программный setBounds (autoFit, initialBounds, оверлеи). */
  onBoundsChange?: (bounds: LatLngBounds, meta: { user: boolean }) => void;

  /** Начальная область (SSR-восстановление ?sw_lat=…): map.setBounds после
   *  создания вместо center/zoom. Читается один раз. */
  initialBounds?: LatLngBounds | null;

  /** Текущий режим рисования. */
  drawMode?: DrawMode;
  /** Автоподгон вида под маркеры при смене набора (true на /search, false на /map). */
  autoFit?: boolean;
  /** Центрировать карту к активному пину при наведении/выборе. Default false
   *  (карта стоит на месте — Zillow-режим). Управляется admin-флагом. */
  recenterOnHover?: boolean;

  /** Превью кликнутого пина: карточка рисуется НАД пином (Zillow), позиция
   *  пересчитывается при драге/зуме и клампится в границах контейнера карты. */
  preview?: MapPreviewAnchor | null;
  /** Закрытие превью кликом вне карточки (Zillow). Клик по пину не закрывает
   *  (им управляет onSelect), драг карты — тоже не закрывает. */
  onPreviewClose?: () => void;
}

/** Центр карты по умолчанию — Ташкент. */
const TASHKENT_CENTER: LatLng = [41.311, 69.28];
const DEFAULT_ZOOM = 12;
const BOUNDS_DEBOUNCE_MS = 450;
/** Freehand-лассо: не добавляем вершину ближе этого к предыдущей (м) — реже точек. */
const LASSO_MIN_STEP_M = 12;

/** Стиль оверлеев (круг радиуса и территория) — тёмный ink, как в прежнем MapView. */
const OVERLAY_STYLE = {
  strokeColor: '#282218',
  strokeWidth: 2,
  fillColor: '#28221814',
  fillOpacity: 0.08,
} as const;

/** HTML ценового пина: аренда — оранжевый, продажа — красный; активный — тёмный. */
function pinHTML(active: boolean, priceText: string, tx: TransactionType): string {
  const base = tx === 'RENT' ? 'var(--orange, #f2820b)' : 'var(--red, #e03c42)';
  const bg = active ? 'var(--ink, #282218)' : base;
  return `<div class="av-ypin ${active ? 'active' : ''}" style="background:${bg};color:#fff;border:none">${priceText}</div>`;
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
  onPolygonComplete,
  onPolygonProgress,
  onBoundsChange,
  initialBounds = null,
  drawMode = null,
  autoFit = false,
  recenterOnHover = false,
  preview = null,
  onPreviewClose,
}: MapViewProps) {
  const fmt = usePriceFormatter();
  const tSearch = useTranslations('search');
  const { ymaps, status } = useYmaps(locale);

  const elRef = React.useRef<HTMLDivElement | null>(null);
  const mapRef = React.useRef<any>(null);
  const clustererRef = React.useRef<any>(null);
  const placemarksRef = React.useRef<Record<string, any>>({});
  const overlayRef = React.useRef<any>(null); // активный circle/polygon оверлей
  const drawTmpRef = React.useRef<any>(null); // временная геометрия рисования

  // Свежие колбэки/значения в ref — не пересоздаём карту/маркеры зря.
  const cb = React.useRef({ onSelect, onHover, onDrawComplete, onPolygonComplete, onPolygonProgress, onBoundsChange, onPreviewClose });
  cb.current = { onSelect, onHover, onDrawComplete, onPolygonComplete, onPolygonProgress, onBoundsChange, onPreviewClose };
  // Форматтер цены в ref: effects используют актуальный display/rate без пересборки маркеров.
  const fmtRef = React.useRef(fmt);
  fmtRef.current = fmt;
  const circleRef = React.useRef(circle);
  const polygonRef = React.useRef(polygon);
  const drawModeRef = React.useRef(drawMode);
  circleRef.current = circle;
  polygonRef.current = polygon;
  drawModeRef.current = drawMode;
  // Жест пользователя: взводится DOM-событиями контейнера, потребляется на
  // каждом эмите bounds и сбрасывается перед программными setBounds.
  const userGestureRef = React.useRef(false);
  // Начальная область — только на создание карты.
  const initialBoundsRef = React.useRef(initialBounds ?? null);

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

    // SSR-восстановление области (?sw_lat=…): вид по bbox вместо center/zoom.
    if (initialBoundsRef.current) {
      const ib = initialBoundsRef.current;
      userGestureRef.current = false;
      try {
        map.setBounds(
          [[ib.swLat, ib.swLng], [ib.neLat, ib.neLng]],
          { checkZoomRange: true },
        );
      } catch {
        /* некорректный bbox — остаёмся на center/zoom */
      }
    }

    // Эмит текущей видимой области карты в onBoundsChange (с защитой от режима
    // рисования / зафиксированной территории — тогда область считает MapSearch
    // по полигону, а не по bbox).
    const emitBounds = () => {
      if (drawModeRef.current || polygonRef.current) return;
      const b = map.getBounds(); // [[swLat,swLng],[neLat,neLng]]
      if (!b) return;
      const user = userGestureRef.current;
      userGestureRef.current = false; // флаг одноразовый — потребляем на эмите
      cb.current.onBoundsChange?.(
        { swLat: b[0][0], swLng: b[0][1], neLat: b[1][0], neLng: b[1][1] },
        { user },
      );
    };

    // Сдвиг/зум пользователя → подгрузка листингов видимой области (debounce).
    let timer: ReturnType<typeof setTimeout> | null = null;
    map.events.add('boundschange', () => {
      if (!cb.current.onBoundsChange) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(emitBounds, BOUNDS_DEBOUNCE_MS);
    });

    // ── Детект жеста: drag (pointerdown+move>3px), wheel, клик по контролам
    // карты (зум/дабл-клик). Клик по ценовому пину (.av-ypin) жестом НЕ считается
    // — это onSelect, области не меняет. Capture-фаза: ymaps глушит bubbling.
    // На сенсорах браузер может прервать последовательность pointercancel'ом —
    // сбрасываем незавершённое нажатие, иначе downXY зависает и ломает жест.
    const gestureEl = elRef.current;
    let downXY: [number, number] | null = null;
    const onPointerDown = (e: PointerEvent) => {
      downXY = [e.clientX, e.clientY];
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!downXY) return;
      if (Math.abs(e.clientX - downXY[0]) + Math.abs(e.clientY - downXY[1]) > 3) {
        userGestureRef.current = true;
      }
    };
    const onPointerUp = () => {
      downXY = null;
    };
    const onWheel = () => {
      userGestureRef.current = true;
    };
    const onContainerClick = (e: MouseEvent) => {
      if (!(e.target as HTMLElement | null)?.closest?.('.av-ypin')) {
        userGestureRef.current = true;
      }
    };
    gestureEl?.addEventListener('pointerdown', onPointerDown, true);
    gestureEl?.addEventListener('pointermove', onPointerMove, true);
    gestureEl?.addEventListener('pointerup', onPointerUp, true);
    gestureEl?.addEventListener('pointercancel', onPointerUp, true);
    gestureEl?.addEventListener('wheel', onWheel, { capture: true, passive: true });
    gestureEl?.addEventListener('click', onContainerClick, true);

    // Стартовая выдача: один раз эмитим текущую (по умолчанию — Ташкент) область
    // сразу на загрузке, чтобы список не был пустым и пины появились без действий
    // пользователя. setTimeout(0) — даём контейнеру разложиться, чтобы getBounds()
    // вернул корректный bbox. Дальше юзер двигает карту сам (boundschange выше).
    const initTimer = setTimeout(emitBounds, 0);

    return () => {
      if (timer) clearTimeout(timer);
      clearTimeout(initTimer);
      gestureEl?.removeEventListener('pointerdown', onPointerDown, true);
      gestureEl?.removeEventListener('pointermove', onPointerMove, true);
      gestureEl?.removeEventListener('pointerup', onPointerUp, true);
      gestureEl?.removeEventListener('pointercancel', onPointerUp, true);
      gestureEl?.removeEventListener('wheel', onWheel, { capture: true } as EventListenerOptions);
      gestureEl?.removeEventListener('click', onContainerClick, true);
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
      const priceText = fmtRef.current.pin(l);
      const pm = new ymaps.Placemark(
        [l.lat, l.lng],
        { listingId: l.id },
        {
          iconLayout: makeIconLayout(ymaps, pinHTML(l.id === activeId, priceText, l.tx)),
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
        userGestureRef.current = false; // программный автоподгон — не жест
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
      pm.options.set('iconLayout', makeIconLayout(ymaps, pinHTML(l.id === activeId, fmtRef.current.pin(l), l.tx)));
      pm.options.set('zIndex', l.id === activeId ? 1000 : 0);
    });
    if (recenterOnHover && activeId) {
      const a = listings.find((l) => l.id === activeId);
      if (a?.lat != null && a?.lng != null) {
        userGestureRef.current = false; // программное панорамирование к пину — не жест
        map.panTo([a.lat, a.lng], { flying: true });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, ymaps, recenterOnHover]);

  // ── Превью пина: карточка у кликнутого пина (Zillow) ──
  // Позиция считается в пикселях контейнера (globalPixels − центр карты) и
  // обновляется прямой мутацией style (actiontick во время драга/зума —
  // без React-рендеров). Карточка ставится над пином; не влезла — под ним;
  // по горизонтали и вертикали клампится в границах карты.
  const previewWrapRef = React.useRef<HTMLDivElement | null>(null);
  const previewListing = preview
    ? listings.find((l) => l.id === preview.listingId) ?? null
    : null;
  const previewCoords: LatLng | null =
    previewListing?.lat != null && previewListing?.lng != null
      ? [previewListing.lat, previewListing.lng]
      : null;
  const previewCoordsRef = React.useRef(previewCoords);
  previewCoordsRef.current = previewCoords;
  const hasPreview = Boolean(preview && previewCoords);

  React.useEffect(() => {
    const map = mapRef.current;
    const el = previewWrapRef.current;
    if (!map || !ymaps || !el || !hasPreview) return;

    const PIN_GAP = 22; // от центра пина до карточки (пин ~32px высотой)
    const PAD = 8; // мин. отступ карточки от краёв карты

    const reposition = (tick?: { globalPixelCenter: [number, number]; zoom: number }) => {
      const coords = previewCoordsRef.current;
      if (!coords) return;
      const zoom = tick?.zoom ?? map.getZoom();
      const centerPx = tick?.globalPixelCenter ?? map.getGlobalPixelCenter();
      const projection = map.options.get('projection');
      const g = projection.toGlobalPixels(coords, zoom);
      const [w, h] = map.container.getSize();
      const x = g[0] - centerPx[0] + w / 2;
      const y = g[1] - centerPx[1] + h / 2;
      const cw = el.offsetWidth;
      const ch = el.offsetHeight;
      const left = Math.min(Math.max(x - cw / 2, PAD), Math.max(w - cw - PAD, PAD));
      let top = y - ch - PIN_GAP; // над пином
      if (top < PAD) top = y + PIN_GAP; // не влезла сверху — под пином
      top = Math.min(Math.max(top, PAD), Math.max(h - ch - PAD, PAD));
      el.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
      el.style.visibility = 'visible';
    };

    reposition();
    const onTick = (e: any) => reposition(e.get('tick'));
    const onChange = () => reposition();
    map.events.add('actiontick', onTick);
    map.events.add('boundschange', onChange);
    map.container.events.add('sizechange', onChange);
    return () => {
      map.events.remove('actiontick', onTick);
      map.events.remove('boundschange', onChange);
      map.container.events.remove('sizechange', onChange);
    };
    // Пересчёт при смене пина/готовности карты; координаты — из ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview?.listingId, hasPreview, ymaps]);

  // ── Закрытие превью кликом вне карточки (Zillow) ──
  // Слушаем document (закрывает и клик по списку/фильтрам, не только по карте).
  // «Клик» = pointerdown+pointerup без сдвига >3px — драг карты не закрывает
  // (карточка едет за пином через actiontick). Нажатие, начатое внутри карточки
  // (стрелки карусели, сердце, X), и клик по ценовому пину не закрывают:
  // пином управляет onSelect (переключение превью на другой листинг).
  React.useEffect(() => {
    if (!hasPreview) return;
    let down: { x: number; y: number; ignore: boolean } | null = null;
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null;
      down = {
        x: e.clientX,
        y: e.clientY,
        ignore: Boolean(
          (previewWrapRef.current && t && previewWrapRef.current.contains(t)) ||
            t?.closest?.('.av-ypin'),
        ),
      };
    };
    const onUp = (e: PointerEvent) => {
      const d = down;
      down = null;
      if (!d || d.ignore) return;
      if (Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 3) return;
      cb.current.onPreviewClose?.();
    };
    const onCancel = () => {
      down = null;
    };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('pointerup', onUp, true);
    document.addEventListener('pointercancel', onCancel, true);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('pointerup', onUp, true);
      document.removeEventListener('pointercancel', onCancel, true);
    };
  }, [hasPreview]);

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
        userGestureRef.current = false;
        map.setBounds(c.geometry.getBounds(), { checkZoomRange: true, zoomMargin: 40 });
      } catch {
        /* no-op */
      }
    } else if (polygon && polygon.length >= 3) {
      const p = new ymaps.Polygon([[...polygon, polygon[0]]], {}, { ...OVERLAY_STYLE, interactivityModel: 'default#transparent' });
      map.geoObjects.add(p);
      overlayRef.current = p;
      try {
        userGestureRef.current = false;
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

  // ── Рисование ТЕРРИТОРИИ (/map): freehand-лассо — зажал → обвёл → отпустил ──
  // Тот же механизм событий карты, что и у радиуса; вместо круга копим путь
  // обводки в полигон. Отпускание мыши замыкает территорию (≥3 точек).
  const pointsRef = React.useRef<LatLng[]>([]);
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map || !ymaps || drawMode !== 'polygon') return;

    map.behaviors.disable('drag');
    const el = elRef.current;
    const prevCursor = el?.style.cursor ?? '';
    if (el) el.style.cursor = 'crosshair';

    let drawing = false;
    let shape: any = null;
    pointsRef.current = [];
    cb.current.onPolygonProgress?.(0);

    const onDown = (e: any) => {
      drawing = true;
      pointsRef.current = [e.get('coords') as LatLng];
      shape = new ymaps.Polygon([[]], {}, { ...OVERLAY_STYLE, interactivityModel: 'default#transparent' });
      map.geoObjects.add(shape);
      drawTmpRef.current = shape;
      cb.current.onPolygonProgress?.(1);
    };
    const onMove = (e: any) => {
      if (!drawing || !shape) return;
      const c = e.get('coords') as LatLng;
      const pts = pointsRef.current;
      const last = pts[pts.length - 1];
      // Прореживаем: пропускаем точки ближе LASSO_MIN_STEP_M к предыдущей.
      if (last && ymaps.coordSystem.geo.getDistance(last, c) < LASSO_MIN_STEP_M) return;
      pts.push(c);
      shape.geometry.setCoordinates([pts]); // открытое кольцо во время обводки
      cb.current.onPolygonProgress?.(pts.length);
    };
    const onUp = () => {
      if (!drawing) return;
      drawing = false;
      const pts = pointsRef.current;
      if (shape) {
        map.geoObjects.remove(shape);
        shape = null;
        drawTmpRef.current = null;
      }
      // ≥3 точек → территория готова (оверлей-эффект отрисует её по `polygon`).
      if (pts.length >= 3) cb.current.onPolygonComplete?.(pts);
      else cb.current.onPolygonProgress?.(0); // слишком короткая обводка — сброс
      pointsRef.current = [];
    };

    map.events.add('mousedown', onDown);
    map.events.add('mousemove', onMove);
    map.events.add('mouseup', onUp);
    return () => {
      map.events.remove('mousedown', onDown);
      map.events.remove('mousemove', onMove);
      map.events.remove('mouseup', onUp);
      if (drawTmpRef.current) {
        map.geoObjects.remove(drawTmpRef.current);
        drawTmpRef.current = null;
      }
      if (el) el.style.cursor = prevCursor;
      map.behaviors.enable('drag');
    };
  }, [drawMode, ymaps]);

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
    <>
      <div
        ref={elRef}
        className="h-full w-full bg-[#e8ede9]"
        role="img"
        aria-label={tSearch('map.ariaLabel')}
      />
      {/* Якорь превью: absolute относительно relative-контейнера карты у родителя;
          позицию (transform) ставит эффект выше, до первого расчёта скрыт. */}
      {hasPreview && preview && (
        <div
          ref={previewWrapRef}
          className="absolute left-0 top-0 z-[1000]"
          style={{ visibility: 'hidden', willChange: 'transform' }}
        >
          {preview.node}
        </div>
      )}
    </>
  );
}

export type { YmapsStatus };
