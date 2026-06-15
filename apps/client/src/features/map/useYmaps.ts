/**
 * useYmaps — клиентская загрузка Yandex Maps JS API 2.1 (CLAUDE.md §12).
 *
 * Грузим скрипт по ключу `NEXT_PUBLIC_YANDEX_MAPS_API_KEY` один раз на страницу
 * (module-level singleton — несколько карт делят одну загрузку) и резолвимся,
 * когда `ymaps.ready` отработал. Только клиент: hook ничего не делает при SSR.
 *
 * Состояния деградации (карта не должна ронять страницу):
 *  - `no-key`  — ключ не задан в env → показываем подсказку вместо карты;
 *  - `error`   — скрипт/ready упали → показываем сообщение об ошибке.
 *
 * Тип `ymaps` — внешний глобал; держим `any` локально (без новой зависимости
 * @types/yandex-maps), вся «грязь» инкапсулирована здесь и в MapView.
 */
'use client';

import * as React from 'react';

// `ymaps` — внешний глобал без типов (без зависимости @types/yandex-maps).
export type Ymaps = any;

export type YmapsStatus = 'loading' | 'ready' | 'error' | 'no-key';

const API_KEY = process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY;
// Геосаджест (ymaps.suggest) загружается ТОЛЬКО если в загрузчик передан отдельный
// параметр `suggest_apikey`; иначе SDK кидает «Suggest is not available»
// (docs: yandex.ru/dev/jsapi-v2-1 → dg/concepts/geocoding/suggest). По умолчанию
// берём тот же ключ — достаточно ОДНОГО ключа, если в кабинете Yandex он подключён
// и к «JavaScript API», и к «API Геосаджеста». Отдельный ключ саджеста (если Yandex
// выдал его отдельно) задаётся через NEXT_PUBLIC_YANDEX_SUGGEST_API_KEY.
const SUGGEST_API_KEY = process.env.NEXT_PUBLIC_YANDEX_SUGGEST_API_KEY || API_KEY;

/** ru/en/uz → поддерживаемая локаль Yandex (uz не поддержан → ru_RU). */
function ymapsLang(locale?: string): string {
  if (locale === 'en') return 'en_US';
  return 'ru_RU';
}

/** Singleton-загрузка: один <script> и один общий промис на документ. */
let loaderPromise: Promise<Ymaps> | null = null;

export function loadYmaps(locale?: string): Promise<Ymaps> {
  if (typeof window === 'undefined') return Promise.reject(new Error('SSR'));
  const w = window as unknown as { ymaps?: Ymaps };
  if (w.ymaps?.Map) return Promise.resolve(w.ymaps);
  if (loaderPromise) return loaderPromise;

  loaderPromise = new Promise<Ymaps>((resolve, reject) => {
    const existing = document.getElementById('yandex-maps-sdk') as HTMLScriptElement | null;
    const onReady = () => {
      if (w.ymaps?.ready) w.ymaps.ready(() => resolve(w.ymaps));
      else reject(new Error('ymaps missing after load'));
    };
    if (existing) {
      existing.addEventListener('load', onReady);
      existing.addEventListener('error', () => reject(new Error('ymaps script error')));
      if (w.ymaps?.ready) onReady();
      return;
    }
    const script = document.createElement('script');
    script.id = 'yandex-maps-sdk';
    script.async = true;
    const suggestParam = SUGGEST_API_KEY
      ? `&suggest_apikey=${encodeURIComponent(SUGGEST_API_KEY)}`
      : '';
    script.src = `https://api-maps.yandex.ru/2.1/?apikey=${encodeURIComponent(
      API_KEY ?? '',
    )}&lang=${ymapsLang(locale)}${suggestParam}`;
    script.addEventListener('load', onReady);
    script.addEventListener('error', () => {
      loaderPromise = null; // позволить повторную попытку при следующем монтировании
      reject(new Error('ymaps script error'));
    });
    document.head.appendChild(script);
  });
  return loaderPromise;
}

/**
 * Возвращает готовый объект `ymaps` и статус загрузки. `locale` влияет только на
 * язык первого (singleton) запроса скрипта.
 */
export function useYmaps(locale?: string): { ymaps: Ymaps | null; status: YmapsStatus } {
  const [ymaps, setYmaps] = React.useState<Ymaps | null>(null);
  const [status, setStatus] = React.useState<YmapsStatus>(API_KEY ? 'loading' : 'no-key');

  React.useEffect(() => {
    if (!API_KEY) return;
    let alive = true;
    loadYmaps(locale)
      .then((y) => {
        if (!alive) return;
        setYmaps(y);
        setStatus('ready');
      })
      .catch(() => {
        if (alive) setStatus('error');
      });
    return () => {
      alive = false;
    };
  }, [locale]);

  return { ymaps, status };
}
