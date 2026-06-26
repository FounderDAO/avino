import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@avino/shared'],

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
