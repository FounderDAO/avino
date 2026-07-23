/**
 * sessionDevice — простой разбор user_agent сессии в «Браузер · ОС»
 * (вкладка «Устройства», ADR-0145). Без библиотек: точность «какое из моих
 * устройств это» достаточна на уровне семейства браузера и ОС.
 *
 * Порядок проверок важен: почти все Chromium-браузеры содержат "Chrome",
 * а почти всё содержит "Safari" — специфичные маркеры проверяем первыми.
 */

export interface DeviceInfo {
  /** Семейство браузера (proper noun, не переводится) или null. */
  browser: string | null;
  /** Семейство ОС (proper noun, не переводится) или null. */
  os: string | null;
  /** Мобильное устройство (для выбора иконки). */
  mobile: boolean;
}

/** Маркер → имя браузера; проверяются по порядку. */
const BROWSERS: ReadonlyArray<[RegExp, string]> = [
  [/YaBrowser\//, 'Yandex Browser'],
  [/Edg(e|A|iOS)?\//, 'Edge'],
  [/(OPR|Opera)\//, 'Opera'],
  [/SamsungBrowser\//, 'Samsung Internet'],
  [/(Firefox|FxiOS)\//, 'Firefox'],
  [/(Chrome|CriOS)\//, 'Chrome'],
  [/Safari\//, 'Safari'],
];

/** Маркер → имя ОС; проверяются по порядку (iOS раньше Mac OS X: iPad UA содержит оба). */
const OSES: ReadonlyArray<[RegExp, string]> = [
  [/Windows/, 'Windows'],
  [/(iPhone|iPad|iPod)/, 'iOS'],
  [/Android/, 'Android'],
  [/Mac OS X|Macintosh/, 'macOS'],
  [/Linux/, 'Linux'],
];

export function parseUserAgent(ua: string | null | undefined): DeviceInfo {
  if (!ua || !ua.trim()) return { browser: null, os: null, mobile: false };

  const browser = BROWSERS.find(([re]) => re.test(ua))?.[1] ?? null;
  const os = OSES.find(([re]) => re.test(ua))?.[1] ?? null;
  const mobile = /(Mobile|iPhone|iPad|iPod|Android)/.test(ua);

  return { browser, os, mobile };
}

/** Подпись устройства: «Chrome · macOS» / одна часть / null (нет данных). */
export function deviceLabel(ua: string | null | undefined): string | null {
  const { browser, os } = parseUserAgent(ua);
  const parts = [browser, os].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}
