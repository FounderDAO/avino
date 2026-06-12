/**
 * Categories — плитки-чипы категорий недвижимости (из home.jsx).
 * Каждый чип — ссылка на выдачу /search?tx=SALE&type=...
 * Server component: статичные ссылки, без состояния.
 */
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Building2, Home as HomeIcon, Store, Trees, type LucideIcon } from 'lucide-react';
import type { PropertyType } from '@/lib/mock/types';

/** Категории с иконками (порядок и подписи как в дизайн-источнике). */
const CATEGORIES: { type: PropertyType; Icon: LucideIcon }[] = [
  { type: 'APARTMENT', Icon: Building2 },
  { type: 'HOUSE', Icon: HomeIcon },
  { type: 'NEW_BUILDING', Icon: Building2 },
  { type: 'COMMERCIAL', Icon: Store },
  { type: 'LAND', Icon: Trees },
];

export function Categories() {
  const t = useTranslations('home');
  return (
    <div className="mx-auto max-w-[1280px] px-4 pt-7 sm:px-6">
      <div className="flex flex-wrap justify-center gap-3">
        {CATEGORIES.map(({ type, Icon }) => (
          <Link
            key={type}
            href={`/search?tx=SALE&type=${type}`}
            className="inline-flex items-center gap-[7px] rounded-pill border-[1.5px] border-border bg-surface px-5 py-[11px] text-[15px] font-semibold text-ink transition-colors duration-150 hover:border-ink"
          >
            <Icon size={18} strokeWidth={1.9} className="text-teal" />
            {t(`categories.${type}`)}
          </Link>
        ))}
      </div>
    </div>
  );
}
