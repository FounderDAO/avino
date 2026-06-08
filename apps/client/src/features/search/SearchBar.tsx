'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * SearchBar (TASK-191) — поисковая строка hero публичного портала.
 *
 * Высокое скруглённое белое поле + кнопка с иконкой поиска (бренд-красный).
 * По Enter / клику навигирует на `/sale?q=<encoded>` (sale — дефолтный тип
 * сделки). Пустой ввод → `/sale` без query. Навигация через next/navigation
 * (CLAUDE.md §4: данные тянет RTK Query на странице выдачи, тут только роутинг).
 */

const STRINGS = {
  placeholder: 'Город, район или адрес',
  label: 'Поиск недвижимости',
  submit: 'Найти',
} as const;

export function SearchBar() {
  const router = useRouter();
  const [query, setQuery] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    const href = trimmed
      ? `/sale?q=${encodeURIComponent(trimmed)}`
      : '/sale';
    router.push(href);
  };

  return (
    <form
      role="search"
      onSubmit={submit}
      className="flex w-full items-center gap-2 rounded-xl bg-card p-2 shadow-lg"
    >
      <label htmlFor="hero-search" className="sr-only">
        {STRINGS.label}
      </label>
      <input
        id="hero-search"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={STRINGS.placeholder}
        aria-label={STRINGS.label}
        className="h-12 flex-1 bg-transparent px-3 text-base text-foreground outline-none placeholder:text-muted-foreground"
      />
      <Button type="submit" size="lg" className="h-12 px-5" aria-label={STRINGS.submit}>
        <Search aria-hidden="true" />
        <span className="hidden sm:inline">{STRINGS.submit}</span>
      </Button>
    </form>
  );
}
