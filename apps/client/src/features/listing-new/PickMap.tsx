/**
 * PickMap — выбор точки объекта на РЕАЛЬНОЙ Yandex-карте (CLAUDE.md §12).
 * Одна перетаскиваемая метка: клик по карте ставит/двигает точку, перетаскивание
 * метки уточняет её. Каждое изменение эмитит координаты (onChange) и обратно
 * геокодит точку → строку адреса (onAddressResolve) — двусторонняя синхронизация
 * с инпутом адреса (AddressStep).
 *
 * Внешнее изменение `value` (выбор подсказки → геокод) центрирует карту и двигает
 * метку. Деградация (нет ключа / SDK упал): вместо карты — подсказка, шаг не падает
 * (координаты опциональны, адрес задаётся текстом).
 */
'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { useYmaps } from '@/features/map/useYmaps';
import { reverseGeocode } from '@/features/map/geocode';

/** Координаты [lat, lng]. */
export type Coords = [number, number];

/** Мягкий фокус карты (выбор региона/района): центр + zoom, БЕЗ установки метки. */
export interface MapFocus {
  coords: Coords;
  zoom: number;
}

export interface PickMapProps {
  value: Coords | null;
  onChange: (coords: Coords) => void;
  /** Обратный геокод точки → строка адреса (синхронизация с инпутом). */
  onAddressResolve?: (address: string) => void;
  /** Внешнее перецентрирование карты (метка и value не меняются). */
  focus?: MapFocus | null;
  locale?: string;
}

/** Центр карты по умолчанию (Ташкент) + масштабы. */
const TASHKENT_CENTER: Coords = [41.311, 69.28];
const DEFAULT_ZOOM = 12;
const PLACED_ZOOM = 16;
const EPS = 1e-6;

const sameCoords = (a: Coords | null, b: Coords | null): boolean =>
  !!a && !!b && Math.abs(a[0] - b[0]) < EPS && Math.abs(a[1] - b[1]) < EPS;

export function PickMap({ value, onChange, onAddressResolve, focus, locale }: PickMapProps) {
  const t = useTranslations('listingNew');
  const { ymaps, status } = useYmaps(locale);

  const elRef = React.useRef<HTMLDivElement>(null);
  const mapRef = React.useRef<any>(null);
  const markerRef = React.useRef<any>(null);
  const setMarkerRef = React.useRef<((c: Coords) => void) | null>(null);
  // Последняя эмитнутая точка — чтобы не центрировать карту в ответ на свой же клик.
  const lastEmitted = React.useRef<Coords | null>(null);

  // Свежие колбэки без пересоздания карты (карта строится один раз).
  const cbRef = React.useRef({ onChange, onAddressResolve, locale });
  cbRef.current = { onChange, onAddressResolve, locale };
  // Актуальный focus для инициализации (карта могла ещё грузиться при выборе региона).
  const focusRef = React.useRef(focus);
  focusRef.current = focus;

  // Инициализация карты — один раз, когда SDK готов.
  React.useEffect(() => {
    if (status !== 'ready' || !ymaps || !elRef.current || mapRef.current) return;

    const emit = (coords: Coords, reverse: boolean) => {
      lastEmitted.current = coords;
      cbRef.current.onChange(coords);
      if (reverse && cbRef.current.onAddressResolve) {
        reverseGeocode(coords, cbRef.current.locale).then((addr) => {
          if (addr) cbRef.current.onAddressResolve?.(addr);
        });
      }
    };

    const start = value ?? focusRef.current?.coords ?? TASHKENT_CENTER;
    const startZoom = value ? PLACED_ZOOM : (focusRef.current?.zoom ?? DEFAULT_ZOOM);
    const map = new ymaps.Map(
      elRef.current,
      { center: start, zoom: startZoom, controls: ['zoomControl', 'geolocationControl'] },
      { suppressMapOpenBlock: true },
    );
    mapRef.current = map;

    const setMarker = (coords: Coords) => {
      if (!markerRef.current) {
        const pm = new ymaps.Placemark(coords, {}, { draggable: true, preset: 'islands#redIcon' });
        pm.events.add('dragend', () => {
          const c = pm.geometry.getCoordinates() as Coords;
          emit(c, true);
        });
        markerRef.current = pm;
        map.geoObjects.add(pm);
      } else {
        markerRef.current.geometry.setCoordinates(coords);
      }
    };
    setMarkerRef.current = setMarker;

    if (value) {
      setMarker(value);
      lastEmitted.current = value;
    }

    map.events.add('click', (e: any) => {
      const c = e.get('coords') as Coords;
      setMarker(c);
      emit(c, true);
    });

    return () => {
      map.destroy();
      mapRef.current = null;
      markerRef.current = null;
      setMarkerRef.current = null;
    };
    // value читаем только при инициализации; дальнейшую синхронизацию ведёт эффект ниже.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, ymaps]);

  // Мягкий фокус (выбор региона/района): центрируем карту, метку не трогаем.
  React.useEffect(() => {
    if (!focus || !mapRef.current) return;
    mapRef.current.setCenter(focus.coords, focus.zoom, { duration: 200 });
  }, [focus]);

  // Внешнее изменение точки (выбор подсказки → геокод): двигаем метку и центрируем.
  React.useEffect(() => {
    if (!value || !mapRef.current || !setMarkerRef.current) return;
    if (sameCoords(lastEmitted.current, value)) return; // наш же клик/перетаскивание
    setMarkerRef.current(value);
    mapRef.current.setCenter(value, PLACED_ZOOM, { duration: 200 });
    lastEmitted.current = value;
  }, [value]);

  return (
    <div>
      {status === 'ready' ? (
        <div
          ref={elRef}
          aria-label={t('fields.mapPoint')}
          className="h-[300px] w-full overflow-hidden rounded-input border border-border bg-[#e9eee7]"
        />
      ) : (
        <div className="flex h-[300px] w-full items-center justify-center rounded-input border border-border bg-[#e9eee7] px-6 text-center">
          <span className="rounded-pill bg-surface/90 px-3.5 py-1.5 text-[13px] font-semibold text-ink shadow-card">
            {status === 'loading' ? t('map.loading') : t('map.unavailable')}
          </span>
        </div>
      )}
      <p className="mt-2 text-[13px] text-muted-foreground">
        {value ? (
          <>
            {t('map.pointLabel')}{' '}
            <b className="text-ink">
              {value[0].toFixed(5)}, {value[1].toFixed(5)}
            </b>
          </>
        ) : (
          t('map.helpEmpty')
        )}
      </p>
    </div>
  );
}
