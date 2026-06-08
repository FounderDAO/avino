'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import { Logo } from './Logo';
import { cn } from '@/lib/utils';

/**
 * Публичная шапка портала (UX-референс Zillow: лого + горизонтальная навигация).
 * Бренд и палитра — Avino (ADR-0060). Без ипотеки / Home Loans (нет billing в MVP).
 * i18n-строки временно на ru; выносятся в t() в задаче локализации.
 */

type NavItem = { label: string; href: string };

const NAV: NavItem[] = [
  { label: 'Купить', href: '/sale' },
  { label: 'Аренда', href: '/rent' },
  { label: 'Продать', href: '/sell' },
  { label: 'Помощь', href: '/help' },
];

export function Header() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <Logo />

        {/* Desktop nav */}
        <nav className="hidden items-center gap-1 md:flex" aria-label="Основная навигация">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              {item.label}
            </Link>
          ))}
          <Link
            href="/login"
            className="ml-2 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            Войти
          </Link>
        </nav>

        {/* Mobile toggle */}
        <button
          type="button"
          className="inline-flex size-9 items-center justify-center rounded-md text-foreground hover:bg-muted md:hidden"
          aria-label={open ? 'Закрыть меню' : 'Открыть меню'}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      {/* Mobile menu */}
      <nav
        className={cn('border-t border-border md:hidden', open ? 'block' : 'hidden')}
        aria-label="Мобильная навигация"
      >
        <ul className="mx-auto max-w-7xl px-4 py-2 sm:px-6">
          {[...NAV, { label: 'Войти', href: '/login' }].map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="block rounded-md px-3 py-2.5 text-sm font-medium text-foreground hover:bg-muted"
                onClick={() => setOpen(false)}
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
