/**
 * LangSwitcher — переключатель языка интерфейса.
 * Меняет [locale]-сегмент URL, сохраняя путь и query; cookie NEXT_LOCALE
 * ставит middleware next-intl.
 */
'use client';

import * as React from 'react';
import { Globe, ChevronDown } from 'lucide-react';
import { useLocale } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import {
  Dropdown,
  DropdownTrigger,
  DropdownContent,
  DropdownItem,
} from '@/components/ui/dropdown';

// Названия языков — на родном языке каждого (стандарт UX), в словари не выносятся.
const LANGS: { code: Locale; short: string; label: string }[] = [
  { code: 'ru', short: 'RU', label: 'Русский' },
  { code: 'uz', short: 'UZ', label: 'O‘zbekcha' },
  { code: 'en', short: 'EN', label: 'English' },
];

export function LangSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const current = LANGS.find((l) => l.code === locale) ?? LANGS[0];

  function switchTo(next: Locale) {
    if (next === locale) return;
    // Query читаем в момент клика (event handler) — useSearchParams потребовал бы
    // Suspense-границы и сломал бы статический fallback Header.
    const qs = window.location.search;
    router.replace(`${pathname}${qs}`, { locale: next });
  }

  return (
    <Dropdown>
      <DropdownTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-1 rounded-pill border-[1.5px] border-border px-3 py-[7px] text-[13.5px] font-bold text-ink"
        >
          <Globe size={16} strokeWidth={1.9} /> {current.short}
          <ChevronDown size={14} strokeWidth={2} />
        </button>
      </DropdownTrigger>
      <DropdownContent>
        {LANGS.map((l) => (
          <DropdownItem
            key={l.code}
            selected={l.code === locale}
            onSelect={() => switchTo(l.code)}
          >
            {l.label}
          </DropdownItem>
        ))}
      </DropdownContent>
    </Dropdown>
  );
}
