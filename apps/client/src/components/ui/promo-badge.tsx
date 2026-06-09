/**
 * PromoBadge — бейдж продвижения объявления.
 * VIP = золотой градиент со «звёздочкой», TOP = красный, NORMAL = ничего.
 * Опционально показывает «Новое» (зелёный) для свежих NORMAL-объявлений.
 */
import { Sparkles } from 'lucide-react';
import { Badge } from './badge';
import type { PromotionType } from '@/lib/mock/types';

export interface PromoBadgeProps {
  promo: PromotionType;
  className?: string;
}

export function PromoBadge({ promo, className }: PromoBadgeProps) {
  if (promo === 'VIP') {
    return (
      <Badge variant="gold" className={className}>
        <Sparkles size={11} strokeWidth={2.4} /> VIP
      </Badge>
    );
  }
  if (promo === 'TOP') {
    return (
      <Badge variant="top" className={className}>
        TOP
      </Badge>
    );
  }
  return null;
}

/** Бейдж «Новое» для свежих объявлений без промо. */
export function NewBadge({ className }: { className?: string }) {
  return (
    <Badge variant="new" className={className}>
      Новое
    </Badge>
  );
}
