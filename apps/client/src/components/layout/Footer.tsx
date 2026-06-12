/**
 * Footer — тёмный футер (перенос Footer из chrome.jsx).
 * Колонки ссылок, лого со слоганом, соц-иконки, копирайт.
 */
import { Link } from '@/i18n/navigation';
import { Logo } from './Logo';

const COLS: { heading: string; links: { label: string; href: string }[] }[] = [
  {
    heading: 'О компании',
    links: [
      { label: 'О нас', href: '/help' },
      { label: 'Карьера', href: '/help' },
      { label: 'Пресса', href: '/help' },
      { label: 'Контакты', href: '/help' },
    ],
  },
  {
    heading: 'Покупателям',
    links: [
      { label: 'Купить', href: '/search?tx=SALE' },
      { label: 'Снять', href: '/search?tx=RENT' },
      { label: 'Новостройки', href: '/search?tx=SALE&type=NEW_BUILDING' },
      { label: 'Ипотека', href: '/help' },
    ],
  },
  {
    heading: 'Профессионалам',
    links: [
      { label: 'Avino Pro', href: '/sell' },
      { label: 'Разместить объект', href: '/sell' },
      { label: 'Тарифы', href: '/sell' },
      { label: 'Рекламодателям', href: '/help' },
    ],
  },
  {
    heading: 'Помощь',
    links: [
      { label: 'Поддержка', href: '/help' },
      { label: 'Безопасная сделка', href: '/help' },
      { label: 'Условия', href: '/help' },
      { label: 'Конфиденциальность', href: '/help' },
    ],
  },
];

export function Footer() {
  return (
    <footer className="mt-2 bg-ink text-white/70">
      <div className="mx-auto max-w-[1280px] px-6 pb-8 pt-14">
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:grid-cols-[1.4fr_repeat(4,1fr)]">
          <div className="col-span-2 sm:col-span-3 lg:col-span-1">
            <Logo light />
            <p className="mt-3.5 max-w-[240px] text-sm leading-relaxed">
              Национальный портал недвижимости Узбекистана. Покупка и аренда жилья
              по всей стране.
            </p>
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
            <div key={col.heading}>
              <div className="mb-3.5 text-sm font-bold text-white">{col.heading}</div>
              <div className="flex flex-col gap-3">
                {col.links.map((l, i) => (
                  <Link key={`${l.label}-${i}`} href={l.href} className="text-sm hover:text-white">
                    {l.label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-10 flex flex-wrap justify-between gap-3 border-t border-white/[0.12] pt-6 text-[13px]">
          <span>© 2026 Avino · www.avino.uz · Support@avino.uz</span>
          <span>Ташкент, Узбекистан · Валюта: сум / $</span>
        </div>
      </div>
    </footer>
  );
}
