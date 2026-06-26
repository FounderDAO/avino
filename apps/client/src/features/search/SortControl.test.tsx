/**
 * SortControl — тесты (Task 9).
 *
 * Мокируем:
 * - @/i18n/navigation (useRouter, usePathname) — как в FilterBar.test.tsx
 * - next/navigation (useSearchParams)
 * - next-intl (useTranslations) — key→key резолвер
 */
import * as React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// ── Моки навигации ────────────────────────────────────────────────────────────

const mockReplace = vi.fn();
const mockPathname = '/search';
let mockSearchParamsStr = 'tx=SALE';

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
  usePathname: () => mockPathname,
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(mockSearchParamsStr),
}));

// ── Мок next-intl: ns.key → ns.key ───────────────────────────────────────────

vi.mock('next-intl', () => ({
  useTranslations: (ns?: string) =>
    (key: string) => (ns ? `${ns}.${key}` : key),
}));

// Импорт ПОСЛЕ моков
import { SortControl } from './SortControl';

beforeEach(() => {
  mockReplace.mockClear();
  mockSearchParamsStr = 'tx=SALE';
});

// ── Тесты ──────────────────────────────────────────────────────────────────────

describe('SortControl', () => {
  it('рендерится без ошибок', () => {
    const { container } = render(<SortControl />);
    expect(container).toBeTruthy();
  });

  it('показывает <select> с aria-label из i18n', () => {
    render(<SortControl />);
    // Мок: t('sortAria') → 'search.filters.sortAria'
    expect(screen.getByRole('combobox', { name: /search\.filters\.sortAria/i })).toBeInTheDocument();
  });

  it('отображает все 5 опций сортировки', () => {
    render(<SortControl />);
    const select = screen.getByRole('combobox');
    const options = Array.from((select as HTMLSelectElement).options);
    expect(options).toHaveLength(5);
  });

  it('по умолчанию выбрана опция «promotion» (URL без sort=)', () => {
    render(<SortControl />);
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select.value).toBe('promotion');
  });

  it('читает текущее значение sort из URL', () => {
    mockSearchParamsStr = 'tx=SALE&sort=price_asc';
    render(<SortControl />);
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select.value).toBe('price_asc');
  });

  it('смена значения вызывает router.replace с sort=price_asc', () => {
    render(<SortControl />);
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'price_asc' } });
    expect(mockReplace).toHaveBeenCalledOnce();
    const [url] = mockReplace.mock.calls[0] as [string, unknown];
    expect(url).toContain('sort=price_asc');
  });

  it('смена на «promotion» удаляет параметр sort из URL', () => {
    // Начинаем с sort=price_desc в URL
    mockSearchParamsStr = 'tx=SALE&sort=price_desc';
    render(<SortControl />);
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'promotion' } });
    expect(mockReplace).toHaveBeenCalledOnce();
    const [url] = mockReplace.mock.calls[0] as [string, unknown];
    // promotion — дефолт, убирается из URL
    expect(url).not.toContain('sort=');
  });

  it('передаёт scroll:false в router.replace', () => {
    render(<SortControl />);
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'date_desc' } });
    expect(mockReplace).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ scroll: false }),
    );
  });
});
