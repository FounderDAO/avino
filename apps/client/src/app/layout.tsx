/**
 * Root layout публичного портала Avino.
 * Inter (latin + cyrillic), Redux/RTK Provider, chrome (Header + Footer),
 * колоночная раскладка min-h-dvh с растягивающимся main.
 */
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { StoreProvider } from '@/store/StoreProvider';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import './globals.css';

const inter = Inter({
  subsets: ['latin', 'cyrillic'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Avino — недвижимость Узбекистана',
  description:
    'Национальный портал недвижимости Узбекистана. Покупка и аренда жилья по всей стране — поиск, фильтры, карта.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={inter.variable}>
      <body className="font-sans antialiased">
        <StoreProvider>
          <div className="flex min-h-dvh flex-col">
            <Header />
            <main className="flex-1">{children}</main>
            <Footer />
          </div>
        </StoreProvider>
      </body>
    </html>
  );
}
