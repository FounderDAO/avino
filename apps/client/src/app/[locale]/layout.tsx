/**
 * Корневой layout публичного портала Avino (под [locale]-префиксом).
 * Inter (latin + cyrillic), next-intl provider, Redux/RTK Provider,
 * Header + FooterGate (футер скрыт по маршруту на /map и /search), колоночная раскладка min-h-dvh.
 */
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { notFound } from 'next/navigation';
import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { preconnect } from 'react-dom';
import { routing } from '@/i18n/routing';
import { StoreProvider } from '@/store/StoreProvider';
import { Header } from '@/components/layout/Header';
import { FooterGate } from '@/components/layout/FooterGate';
import { JsonLd } from '@/components/seo/JsonLd';
import { BASE } from '@/lib/seo/base';
import '../globals.css';

const inter = Inter({
  subsets: ['latin', 'cyrillic'],
  variable: '--font-inter',
  display: 'swap',
});

// Тот же origin, что baseQuery.ts (без /api/v1 — preconnect держит TCP+TLS
// к домену, путь ему не нужен).
const API_ORIGIN = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';

interface LayoutProps {
  children: React.ReactNode;
  modal: React.ReactNode;
  params: Promise<{ locale: string }>;
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

// Полный LayoutProps (не Pick): сгенерированная проверка Next (.next/types)
// требует, чтобы параметр generateMetadata принимал все пропсы layout.
export async function generateMetadata({
  params,
}: LayoutProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta' });
  return {
    metadataBase: new URL(BASE),
    title: { default: t('title'), template: '%s | Avino' },
    description: t('description'),
    openGraph: {
      type: 'website',
      siteName: 'Avino',
      locale,
    },
    twitter: { card: 'summary_large_image' },
  };
}

export default async function RootLayout({ children, modal, params }: LayoutProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  // Первый fetch к API (auth/refresh, settings/public) иначе платит холодный
  // DNS+TCP+TLS в момент запроса (~1.7с на проде при ~70мс ответа сервера).
  // crossOrigin: 'use-credentials' — запросы к API идут с credentials: 'include'
  // (httpOnly cookie avino_rt, ADR-0153), соединение должно быть credentialed,
  // иначе браузер откроет отдельный сокет под кредентиалный запрос и preconnect
  // не переиспользуется.
  preconnect(API_ORIGIN, { crossOrigin: 'use-credentials' });

  const organizationLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Avino',
    url: BASE,
    sameAs: [
      'https://t.me/avino_uz',
      'https://www.instagram.com/avino.uz',
      'https://www.facebook.com/avino.uz',
      'https://www.youtube.com/@avino_uz',
    ],
  };

  const websiteLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Avino',
    url: BASE,
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${BASE}/${locale}/search?query={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };

  return (
    <html lang={locale} className={inter.variable}>
      <body className="font-sans antialiased">
        <JsonLd data={organizationLd} />
        <JsonLd data={websiteLd} />
        <NextIntlClientProvider>
          <StoreProvider>
            <div className="flex min-h-dvh flex-col">
              <Header />
              <main className="flex-1">{children}</main>
              {/* Футер по маршруту: на /map и /search скрыт (Zillow-сплит) */}
              <FooterGate />
            </div>
            {modal}
          </StoreProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
