import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@avino/shared'],

  images: {
    // cdn.avino.uz — Cloudflare R2 с кастомным доменом (основное хранилище).
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
