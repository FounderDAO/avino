import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ─── Security-заголовки (ADR-0141) ──────────────────────────────────────────
// Админка без сторонних SDK: allowlist уже, чем на портале — только API,
// Sentry ingest и R2-хосты фото (presigned sign-on-read в <img>).
// CSP_REPORT_ONLY=true на build → заголовок Report-Only (обкатка без поломки).
const API_ORIGIN = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';
const isDev = process.env.NODE_ENV === 'development';

const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  // 'unsafe-inline' — inline-скрипты гидрации Next (nonce-инфраструктуры нет);
  // 'unsafe-eval' — только dev (webpack/HMR)
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://cdn.avino.uz https://*.r2.cloudflarestorage.com https://*.r2.dev",
  "font-src 'self' data:",
  `connect-src 'self' ${API_ORIGIN} https://*.sentry.io`,
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
};

export default nextConfig;
