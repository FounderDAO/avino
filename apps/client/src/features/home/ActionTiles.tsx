import Link from 'next/link';
import { Building2, KeyRound, Tag } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * ActionTiles (TASK-192) — три плитки сценариев под лентой объявлений.
 *
 * Серверный компонент (статичный контент, без интерактива). Каждая плитка —
 * карточка с lucide-иконкой, кратким описанием и CTA-ссылкой на профильный
 * раздел. Сетка: 1 колонка на мобильном, 3 на десктопе. Бренд-акцент —
 * красный (--primary). Без ипотеки / Home Loans (решение по задаче).
 */

const STRINGS = {
  buyTitle: 'Купить',
  buyDesc: 'Квартиры, дома и коммерция в продаже по всему Узбекистану.',
  buyCta: 'Смотреть продажу',
  rentTitle: 'Аренда',
  rentDesc: 'Долгосрочная и посуточная аренда — тысячи актуальных вариантов.',
  rentCta: 'Смотреть аренду',
  sellTitle: 'Продать',
  sellDesc: 'Разместите объявление и найдите покупателя или арендатора.',
  sellCta: 'Подать объявление',
} as const;

interface Tile {
  href: string;
  icon: typeof Building2;
  title: string;
  description: string;
  cta: string;
}

const TILES: Tile[] = [
  {
    href: '/sale',
    icon: Building2,
    title: STRINGS.buyTitle,
    description: STRINGS.buyDesc,
    cta: STRINGS.buyCta,
  },
  {
    href: '/rent',
    icon: KeyRound,
    title: STRINGS.rentTitle,
    description: STRINGS.rentDesc,
    cta: STRINGS.rentCta,
  },
  {
    href: '/sell',
    icon: Tag,
    title: STRINGS.sellTitle,
    description: STRINGS.sellDesc,
    cta: STRINGS.sellCta,
  },
];

export function ActionTiles() {
  return (
    <section aria-label="Что вы хотите сделать">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {TILES.map(({ href, icon: Icon, title, description, cta }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              'group flex flex-col gap-3 rounded-xl border border-border bg-card p-6',
              'transition-shadow hover:shadow-md focus-visible:outline-none',
              'focus-visible:ring-[3px] focus-visible:ring-ring/50',
            )}
          >
            <span className="flex size-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icon className="size-5" aria-hidden="true" />
            </span>
            <h3 className="text-lg font-semibold text-foreground">{title}</h3>
            <p className="text-sm text-muted-foreground">{description}</p>
            <span className="mt-auto text-sm font-medium text-primary group-hover:underline">
              {cta} →
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
