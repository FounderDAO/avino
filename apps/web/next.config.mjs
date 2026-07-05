import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
};

export default nextConfig;
