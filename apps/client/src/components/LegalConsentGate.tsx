'use client';

import { LegalConsentModal } from '@/components/layout/LegalConsentModal';
import { useLegalConsentGate } from '@/lib/useLegalConsentGate';

/**
 * Глобальный гейт согласия: монтируется один раз (StoreProvider) и рендерит
 * блокирующую модалку, только когда согласие требуется. Модалка перекрывает
 * любую страницу публичного портала.
 */
export function LegalConsentGate() {
  const shouldShow = useLegalConsentGate();
  if (!shouldShow) return null;
  return <LegalConsentModal />;
}
