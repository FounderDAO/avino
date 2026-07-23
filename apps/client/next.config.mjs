import path from 'node:path';
import { fileURLToPath } from 'node:url';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

// ─── Security-заголовки (ADR-0141) ──────────────────────────────────────────
// CSP собирается на build (env инлайнится при сборке образа). Allowlist —
// только рантайм-зависимости портала: Yandex Maps SDK (скрипт с api-maps
// дозагружает чанки/JSONP-саджест с *.yandex.ru, тайлы с *.yandex.net),
// Google GSI, Apple JS, Sentry ingest, R2-хосты фото (sign-on-read).
// CSP_REPORT_ONLY=true на build → заголовок Report-Only (обкатка без поломки).
const API_ORIGIN = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';
const API_WS_ORIGIN = API_ORIGIN.replace(/^http/, 'ws'); // socket.io /rt
const isDev = process.env.NODE_ENV === 'development';

const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  // Apple JS отправляет форму авторизации на appleid.apple.com
  "form-action 'self' https://appleid.apple.com",
  // 'unsafe-inline' — inline-скрипты гидрации Next (nonce-инфраструктуры нет);
  // 'wasm-unsafe-eval' — вектор-рендерер Yandex Maps на WebAssembly (без него
  // canvas карты пустой); 'unsafe-eval' — только dev (webpack/HMR)
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${isDev ? " 'unsafe-eval'" : ''} https://*.yandex.ru https://yastatic.net https://accounts.google.com https://appleid.cdn-apple.com`,
  // accounts.google.com — GSI-кнопка дозагружает свой /gsi/style
  "style-src 'self' 'unsafe-inline' https://accounts.google.com",
  // *.googleusercontent.com — аватары пользователей, вошедших через Google.
  // yandex.ru (голый домен) — пиксель-счётчик Yandex Maps SDK (yandex.ru/clck/
  //   counter); wildcard *.yandex.ru его не покрывает → иначе CSP-шум в консоли.
  "img-src 'self' data: blob: https://cdn.avino.uz https://*.r2.cloudflarestorage.com https://*.r2.dev https://images.unsplash.com https://*.googleusercontent.com https://yandex.ru https://*.yandex.ru https://*.yandex.net https://yastatic.net https://*.gstatic.com",
  "font-src 'self' data:",
  `connect-src 'self' ${API_ORIGIN} ${API_WS_ORIGIN} https://*.yandex.ru https://*.yandex.net https://accounts.google.com https://appleid.apple.com https://*.sentry.io`,
  "frame-src https://accounts.google.com https://appleid.apple.com",
  "worker-src 'self' blob:",
].join('; ');

const securityHeaders = [
  {
    key:
      process.env.CSP_REPORT_ONLY === 'true'
        ? 'Content-Security-Policy-Report-Only'
        : 'Content-Security-Policy',
    value: csp,
  },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@avino/shared'],

  // Docker-рантайм = `node server.js` из минимального self-contained бандла
  // (.next/standalone), без node_modules всего workspace. TASK-233.
  output: 'standalone',
  // Корень трейсинга — корень монорепо (pnpm workspace): иначе Next гадает по
  // лок-файлам и может не включить зависимости из корневого node_modules.
  outputFileTracingRoot: path.join(path.dirname(fileURLToPath(import.meta.url)), '../..'),

  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },

  images: {
    // cdn.avino.uz — Cloudflare R2 с кастомным доменом (основное хранилище, прод).
    // *.r2.cloudflarestorage.com — presigned GET URL приватного бакета (sign-on-read,
    //   ADR-0086): хост S3-API R2; так отдаются фото в dev/staging, где
    //   S3_PUBLIC_BASE_URL не задан. Без него next/image рубит хост → плейсхолдер.
    // pub-*.r2.dev — r2.dev публичный URL (стейджинг / dev-бакет avinodev).
    // images.unsplash.com — мок-обложки (Districts, Sell hero) до замены на R2.
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'cdn.avino.uz',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '**.r2.cloudflarestorage.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '**.r2.dev',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        pathname: '/**',
      },
    ],
  },
};

export default withNextIntl(nextConfig);
