/**
 * Categories — плитки-чипы категорий недвижимости (из home.jsx).
 * Каждый чип — ссылка на выдачу /search?tx=SALE&type=...
 * Server component: статичные ссылки, без состояния.
 */
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Building2, Home as HomeIcon, Store, Trees, type LucideIcon } from 'lucide-react';

/**
 * Категории с иконками (порядок и подписи как в дизайн-источнике).
 * NEW_CONSTRUCTION — не PropertyType, а вычисляемая категория:
 * ведёт на ?new_construction=true (год постройки < 3 лет или будущий).
 */
const CATEGORIES: { key: string; href: string; Icon: LucideIcon }[] = [
  { key: 'APARTMENT', href: '/search?tx=SALE&type=APARTMENT', Icon: Building2 },
  { key: 'HOUSE', href: '/search?tx=SALE&type=HOUSE', Icon: HomeIcon },
  { key: 'NEW_CONSTRUCTION', href: '/search?tx=SALE&new_construction=true', Icon: Building2 },
  { key: 'COMMERCIAL', href: '/search?tx=SALE&type=COMMERCIAL', Icon: Store },
  { key: 'LAND', href: '/search?tx=SALE&type=LAND', Icon: Trees },
];

export function Categories() {
  const t = useTranslations('home');
  return (
    <div className="mx-auto max-w-[1280px] px-4 pt-7 sm:px-6">
      <div className="flex flex-wrap justify-center gap-3">
        {CATEGORIES.map(({ key, href, Icon }) => (
          <Link
            key={key}
            href={href}
            className="inline-flex items-center gap-[7px] rounded-pill border-[1.5px] border-border bg-surface px-5 py-[11px] text-[15px] font-semibold text-ink transition-colors duration-150 hover:border-ink"
          >
            <Icon size={18} strokeWidth={1.9} className="text-teal" />
            {t(`categories.${key}`)}
          </Link>
        ))}
      </div>
    </div>
  );
}
