import Link from 'next/link';
import { Logo } from './Logo';

/**
 * Публичный футер портала (UX-референс Zillow: колонки ссылок + копирайт).
 * Бренд — Avino. Юридические/справочные страницы добавляются отдельными задачами.
 */

type FooterColumn = { title: string; links: { label: string; href: string }[] };

const COLUMNS: FooterColumn[] = [
  {
    title: 'Недвижимость',
    links: [
      { label: 'Купить', href: '/sale' },
      { label: 'Аренда', href: '/rent' },
      { label: 'Продать', href: '/sell' },
    ],
  },
  {
    title: 'Avino',
    links: [
      { label: 'О нас', href: '/about' },
      { label: 'Помощь', href: '/help' },
      { label: 'Контакты', href: '/contacts' },
    ],
  },
  {
    title: 'Правовая информация',
    links: [
      { label: 'Условия использования', href: '/terms' },
      { label: 'Политика конфиденциальности', href: '/privacy' },
    ],
  },
];

export function Footer() {
  return (
    <footer className="mt-16 border-t border-border bg-card">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          <div className="col-span-2 md:col-span-1">
            <Logo />
            <p className="mt-3 max-w-xs text-sm text-muted-foreground">
              Портал недвижимости Узбекистана.
            </p>
          </div>

          {COLUMNS.map((col) => (
            <div key={col.title}>
              <h3 className="text-sm font-semibold text-foreground">{col.title}</h3>
              <ul className="mt-3 space-y-2">
                {col.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-10 border-t border-border pt-6 text-sm text-muted-foreground">
          © {2026} Avino. Все права защищены.
        </div>
      </div>
    </footer>
  );
}
