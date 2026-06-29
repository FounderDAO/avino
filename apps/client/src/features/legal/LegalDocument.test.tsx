/**
 * LegalDocument.test.tsx — рендер юридического документа из модели LegalDoc.
 */
import { render, screen } from '@testing-library/react';
import { it, expect, vi } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import { LegalDocument } from './LegalDocument';

// next-intl/navigation использует next/navigation, которое недоступно в jsdom.
// Минимальный стаб — стандартная практика в этом репозитории.
vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) => (
    <a href={href} className={className}>{children}</a>
  ),
}));
import type { LegalDoc } from '@/content/legal/types';

const msgs = {
  legal: { updatedLabel: 'Последнее обновление', toc: 'Содержание', breadcrumbHome: 'Главная' },
};

const doc: LegalDoc = {
  title: 'Тестовый документ',
  updatedAt: '2026-06-29',
  sections: [
    { id: 'one', heading: 'Раздел один', blocks: [{ type: 'p', text: 'Первый абзац' }] },
    { id: 'two', heading: 'Раздел два', blocks: [{ type: 'list', items: ['Пункт A', 'Пункт B'] }] },
  ],
};

function setup() {
  render(
    <NextIntlClientProvider locale="ru" messages={msgs}>
      <LegalDocument doc={doc} locale="ru" />
    </NextIntlClientProvider>,
  );
}

it('рендерит H1 с заголовком документа', () => {
  setup();
  expect(screen.getByRole('heading', { level: 1, name: 'Тестовый документ' })).toBeInTheDocument();
});

it('рендерит метку «Последнее обновление»', () => {
  setup();
  expect(screen.getByText(/Последнее обновление/)).toBeInTheDocument();
});

it('рендерит обе секции как H2', () => {
  setup();
  expect(screen.getByRole('heading', { level: 2, name: 'Раздел один' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { level: 2, name: 'Раздел два' })).toBeInTheDocument();
});

it('оглавление содержит якорные ссылки на id секций', () => {
  setup();
  expect(screen.getByRole('link', { name: 'Раздел один' })).toHaveAttribute('href', '#one');
  expect(screen.getByRole('link', { name: 'Раздел два' })).toHaveAttribute('href', '#two');
});

it('рендерит пункты списка', () => {
  setup();
  expect(screen.getByText('Пункт A')).toBeInTheDocument();
  expect(screen.getByText('Пункт B')).toBeInTheDocument();
});
