'use client';

import { LegalConsentModal } from '@/components/layout/LegalConsentModal';
import { usePathname } from '@/i18n/navigation';
import { useLegalConsentGate } from '@/lib/useLegalConsentGate';

/**
 * Глобальный гейт согласия: монтируется один раз (StoreProvider) и рендерит
 * блокирующую модалку, только когда согласие требуется. Модалка перекрывает
 * любую страницу публичного портала.
 *
 * Исключение — юридические страницы (`/legal/*`): модалка ссылается на Правила
 * и Политику, и пользователь должен иметь возможность их прочитать, не давая
 * согласия. Это не лазейка: любое реальное действие (поиск, продажа, профиль)
 * по-прежнему за гейтом.
 */
export function LegalConsentGate() {
  const shouldShow = useLegalConsentGate();
  const pathname = usePathname();
  if (!shouldShow) return null;
  if (pathname.startsWith('/legal')) return null;
  return <LegalConsentModal />;
}
