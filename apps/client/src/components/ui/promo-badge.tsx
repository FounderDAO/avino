/**
 * PromoBadge — бейдж продвижения объявления.
 * VIP = золотой градиент со «звёздочкой», TOP = красный, NORMAL = ничего.
 * Опционально показывает «Новое» (зелёный) для свежих NORMAL-объявлений.
 */
import { useTranslations } from 'next-intl';
import { Sparkles } from 'lucide-react';
import { Badge } from './badge';
import { cn } from '@/lib/utils';
import { listingAge } from '@/lib/format';
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

/** Соответствие единицы возраста ключу плюрализации в неймспейсе `units`. */
const AGE_KEY = {
  days: 'daysOnSite',
  weeks: 'weeksOnSite',
  months: 'monthsOnSite',
  years: 'yearsOnSite',
} as const;

/**
 * Бейдж «времени на сайте» (белый пилюль, как у Zillow).
 * Моложе суток → «Новое»; дальше — компактная единица: дни/недели/месяцы/годы.
 */
export function DaysBadge({
  createdAt,
  className,
}: {
  createdAt: string;
  className?: string;
}) {
  const t = useTranslations('units');
  const age = listingAge(createdAt);
  if (!age) return <NewBadge className={className} />;
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-semibold text-ink shadow-[0_1px_5px_rgba(40,34,24,0.18)]',
        className,
      )}
    >
      {t(AGE_KEY[age.unit], { count: age.count })}
    </span>
  );
}
