/**
 * Categories — плитки-чипы категорий недвижимости (из home.jsx).
 * Каждый чип — ссылка на выдачу /search?tx=SALE&type=...
 * Server component: статичные ссылки, без состояния.
 */
import { Link } from '@/i18n/navigation';
import { Building2, Home as HomeIcon, Store, Trees, type LucideIcon } from 'lucide-react';
import type { PropertyType } from '@/lib/mock/types';

/** Категории с иконками (порядок и подписи как в дизайн-источнике). */
const CATEGORIES: { type: PropertyType; label: string; Icon: LucideIcon }[] = [
  { type: 'APARTMENT', label: 'Квартиры', Icon: Building2 },
  { type: 'HOUSE', label: 'Дома', Icon: HomeIcon },
  { type: 'NEW_BUILDING', label: 'Новостройки', Icon: Building2 },
  { type: 'COMMERCIAL', label: 'Коммерческая', Icon: Store },
  { type: 'LAND', label: 'Участки', Icon: Trees },
];

export function Categories() {
  return (
    <div className="mx-auto max-w-[1280px] px-4 pt-7 sm:px-6">
      <div className="flex flex-wrap justify-center gap-3">
        {CATEGORIES.map(({ type, label, Icon }) => (
          <Link
            key={type}
            href={`/search?tx=SALE&type=${type}`}
            className="inline-flex items-center gap-[7px] rounded-pill border-[1.5px] border-border bg-surface px-5 py-[11px] text-[15px] font-semibold text-ink transition-colors duration-150 hover:border-ink"
          >
            <Icon size={18} strokeWidth={1.9} className="text-teal" />
            {label}
          </Link>
        ))}
      </div>
    </div>
  );
}
