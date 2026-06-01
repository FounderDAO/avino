import type { Metadata } from 'next';
import { StoreProvider } from '@/store/StoreProvider';

export const metadata: Metadata = {
  title: 'Avino',
  description: 'Портал недвижимости для Узбекистана',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru">
      <body>
        <StoreProvider>{children}</StoreProvider>
      </body>
    </html>
  );
}
