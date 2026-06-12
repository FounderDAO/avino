/**
 * Footer — тёмный футер (перенос Footer из chrome.jsx).
 * Колонки ссылок, лого со слоганом, соц-иконки, копирайт.
 * Строки — через next-intl (неймспейс `footer`); «Avino Pro» — бренд, не переводится.
 */
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Logo } from './Logo';

const COLS: {
  headingKey: string;
  links: { labelKey?: string; label?: string; href: string }[];
}[] = [
  {
    headingKey: 'aboutCompany',
    links: [
      { labelKey: 'aboutUs', href: '/help' },
      { labelKey: 'careers', href: '/help' },
      { labelKey: 'press', href: '/help' },
      { labelKey: 'contacts', href: '/help' },
    ],
  },
  {
    headingKey: 'forBuyers',
    links: [
      { labelKey: 'buy', href: '/search?tx=SALE' },
      { labelKey: 'rent', href: '/search?tx=RENT' },
      { labelKey: 'newBuildings', href: '/search?tx=SALE&type=NEW_BUILDING' },
      { labelKey: 'mortgage', href: '/help' },
    ],
  },
  {
    headingKey: 'forProfessionals',
    links: [
      { label: 'Avino Pro', href: '/sell' },
      { labelKey: 'postProperty', href: '/sell' },
      { labelKey: 'pricing', href: '/sell' },
      { labelKey: 'advertisers', href: '/help' },
    ],
  },
  {
    headingKey: 'help',
    links: [
      { labelKey: 'support', href: '/help' },
      { labelKey: 'safeDeal', href: '/help' },
      { labelKey: 'terms', href: '/help' },
      { labelKey: 'privacy', href: '/help' },
    ],
  },
];

export function Footer() {
  const t = useTranslations('footer');
  return (
    <footer className="mt-2 bg-ink text-white/70">
      <div className="mx-auto max-w-[1280px] px-6 pb-8 pt-14">
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:grid-cols-[1.4fr_repeat(4,1fr)]">
          <div className="col-span-2 sm:col-span-3 lg:col-span-1">
            <Logo light />
            <p className="mt-3.5 max-w-[240px] text-sm leading-relaxed">{t('slogan')}</p>
            <div className="mt-4 flex gap-2">
              {['TG', 'IG', 'FB', 'YT'].map((s) => (
                <span
                  key={s}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-white/[0.18] text-xs font-bold"
                >
                  {s}
                </span>
              ))}
            </div>
          </div>
          {COLS.map((col) => (
            <div key={col.headingKey}>
              <div className="mb-3.5 text-sm font-bold text-white">{t(col.headingKey)}</div>
              <div className="flex flex-col gap-3">
                {col.links.map((l, i) => (
                  <Link
                    key={`${col.headingKey}-${i}`}
                    href={l.href}
                    className="text-sm hover:text-white"
                  >
                    {l.labelKey ? t(l.labelKey) : l.label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-10 flex flex-wrap justify-between gap-3 border-t border-white/[0.12] pt-6 text-[13px]">
          <span>{t('copyright')}</span>
          <span>{t('location')}</span>
        </div>
      </div>
    </footer>
  );
}
