/**
 * Footer — тёмный футер (перенос Footer из chrome.jsx).
 * Колонки ссылок, лого со слоганом, соц-иконки, копирайт.
 * Проп variant='panel' — компакт для колонки списка /map и /search.
 * Строки — через next-intl (неймспейс `footer`); «Avino Pro» — бренд, не переводится.
 */
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Logo } from './Logo';

export interface FooterProps {
  /**
   * 'panel' — компактная версия для узкой скроллящейся колонки списка
   * (/map и /search, спека 2026-07-17): сетка всегда 2 колонки, отступы меньше,
   * без внешнего mt-2. Дефолт — прежний широкий футер страницы.
   */
  variant?: 'default' | 'panel';
}

const COLS: {
  headingKey: string;
  links: { labelKey?: string; label?: string; href: string }[];
}[] = [
  {
    headingKey: 'aboutCompany',
    links: [
      { labelKey: 'aboutUs', href: '/help' },
      // Временно скрыто: careers, press
      // { labelKey: 'careers', href: '/help' },
      // { labelKey: 'press', href: '/help' },
      { labelKey: 'contacts', href: '/help' },
    ],
  },
  {
    headingKey: 'forBuyers',
    links: [
      { labelKey: 'buy', href: '/search?tx=SALE' },
      { labelKey: 'rent', href: '/search?tx=RENT' },
      { labelKey: 'newConstruction', href: '/search?tx=SALE&new_construction=true' },
      // Временно скрыто: mortgage (Ипотека)
      // { labelKey: 'mortgage', href: '/help' },
    ],
  },
  {
    headingKey: 'forProfessionals',
    links: [
      // Временно скрыто: Avino Pro
      // { label: 'Avino Pro', href: '/sell' },
      { labelKey: 'postProperty', href: '/sell' },
      { labelKey: 'pricing', href: '/sell' },
      { labelKey: 'advertisers', href: '/advertise' },
    ],
  },
  {
    headingKey: 'help',
    links: [
      { labelKey: 'support', href: '/help' },
      // Временно скрыто: safeDeal
      // { labelKey: 'safeDeal', href: '/help' },
      { labelKey: 'terms', href: '/legal/terms' },
      { labelKey: 'privacy', href: '/legal/privacy' },
    ],
  },
];

export function Footer({ variant = 'default' }: FooterProps) {
  const t = useTranslations('footer');
  const panel = variant === 'panel';
  return (
    <footer className={panel ? 'bg-ink text-white/70' : 'mt-2 bg-ink text-white/70'}>
      <div className={panel ? 'px-5 pb-6 pt-10' : 'mx-auto max-w-[1280px] px-6 pb-8 pt-14'}>
        <div
          className={
            panel
              ? 'grid grid-cols-2 gap-8'
              : 'grid grid-cols-2 gap-8 sm:grid-cols-3 lg:grid-cols-[1.4fr_repeat(4,1fr)]'
          }
        >
          <div className={panel ? 'col-span-2' : 'col-span-2 sm:col-span-3 lg:col-span-1'}>
            <Logo light />
            <p className="mt-3.5 max-w-[240px] text-sm leading-relaxed">{t('slogan')}</p>
            <div className="mt-4 flex gap-2">
              {(
                [
                  { label: 'TG', href: 'https://t.me/avino_uz' },
                  { label: 'IG', href: 'https://www.instagram.com/avino.uz' },
                  { label: 'FB', href: 'https://www.facebook.com/avino.uz' },
                  { label: 'YT', href: 'https://www.youtube.com/@avino_uz' },
                ] as const
              ).map(({ label, href }) => (
                <a
                  key={label}
                  href={href}
                  rel="noopener noreferrer"
                  target="_blank"
                  aria-label={label}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-white/[0.18] text-xs font-bold hover:border-white/40 hover:text-white"
                >
                  {label}
                </a>
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
