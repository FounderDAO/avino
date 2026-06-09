/**
 * LangSwitcher — переключатель языка интерфейса (UI без реальной локализации).
 * Локальный стейт выбранного языка; реальная i18n будет позже (вне цикла 1).
 */
'use client';

import * as React from 'react';
import { Globe, ChevronDown } from 'lucide-react';
import {
  Dropdown,
  DropdownTrigger,
  DropdownContent,
  DropdownItem,
} from '@/components/ui/dropdown';

type LangCode = 'ru' | 'uz' | 'en';

const LANGS: { code: LangCode; short: string; label: string }[] = [
  { code: 'ru', short: 'RU', label: 'Русский' },
  { code: 'uz', short: 'UZ', label: 'O‘zbekcha' },
  { code: 'en', short: 'EN', label: 'English' },
];

export function LangSwitcher() {
  const [lang, setLang] = React.useState<LangCode>('ru');
  const current = LANGS.find((l) => l.code === lang) ?? LANGS[0];

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
            selected={l.code === lang}
            onSelect={() => setLang(l.code)}
          >
            {l.label}
          </DropdownItem>
        ))}
      </DropdownContent>
    </Dropdown>
  );
}
