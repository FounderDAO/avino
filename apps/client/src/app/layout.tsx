import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { StoreProvider } from '@/store/StoreProvider';

const inter = Inter({
  subsets: ['latin', 'cyrillic'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'Avino — недвижимость Узбекистана',
  description: 'Портал недвижимости для Узбекистана',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru" className={inter.variable}>
      <body className="bg-background text-foreground antialiased">
        <StoreProvider>{children}</StoreProvider>
      </body>
    </html>
  );
}
