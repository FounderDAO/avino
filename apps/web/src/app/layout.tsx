/**
 * Root layout админки Avino. Inter (latin + cyrillic), lang ru.
 * Светлая тема (как в прототипе AvinoAdmin.html).
 */
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin', 'cyrillic'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Avino Admin — панель управления',
  description: 'Панель администрирования Avino',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={inter.variable}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
