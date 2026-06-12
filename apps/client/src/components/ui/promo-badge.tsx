/**
 * PromoBadge — бейдж продвижения объявления.
 * VIP = золотой градиент со «звёздочкой», TOP = красный, NORMAL = ничего.
 * Опционально показывает «Новое» (зелёный) для свежих NORMAL-объявлений.
 */
import { useTranslations } from 'next-intl';
import { Sparkles } from 'lucide-react';
import { Badge } from './badge';
import type { PromotionType } from '@/lib/mock/types';

export interface PromoBadgeProps {
  promo: PromotionType;
  className?: string;
}

export function PromoBadge({ promo, className }: PromoBadgeProps) {
  const t = useTranslations('common');
  if (promo === 'VIP') {
    return (
      <Badge variant="gold" className={className}>
        <Sparkles size={11} strokeWidth={2.4} /> {t('badgeVip')}
      </Badge>
    );
  }
  if (promo === 'TOP') {
    return (
      <Badge variant="top" className={className}>
        {t('badgeTop')}
      </Badge>
    );
  }
  return null;
}

/** Бейдж «Новое» для свежих объявлений без промо. */
export function NewBadge({ className }: { className?: string }) {
  const t = useTranslations('common');
  return (
    <Badge variant="new" className={className}>
      {t('badgeNew')}
    </Badge>
  );
}
