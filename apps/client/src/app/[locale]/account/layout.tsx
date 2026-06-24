/**
 * Account segment layout.
 * Содержит только noindex-метаданные: личный кабинет не должен индексироваться.
 * Дочерние страницы (account/[tab]) наследуют эту директиву автоматически.
 */
import type { Metadata } from 'next';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AccountSegmentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
