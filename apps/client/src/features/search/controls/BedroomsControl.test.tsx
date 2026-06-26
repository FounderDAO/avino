/**
 * Тесты для BedroomsControl.
 *
 * Мокируем next-intl (useTranslations) по образцу ActiveFilters.test.tsx:
 * t('key') → 'namespace.key' (или просто 'key' без namespace).
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { it, expect, vi } from 'vitest';
import { BedroomsControl } from './BedroomsControl';

// ── Мок next-intl ─────────────────────────────────────────────────────────────

vi.mock('next-intl', () => ({
  useTranslations: (ns?: string) =>
    (key: string) =>
      ns ? `${ns}.${key}` : key,
}));

// ── Тесты ─────────────────────────────────────────────────────────────────────

it('выбор 2+ отдаёт value=2, exact=false', () => {
  const onChange = vi.fn();
  render(<BedroomsControl value={undefined} exact={false} onChange={onChange} />);
  fireEvent.click(screen.getByRole('button', { name: '2+' }));
  expect(onChange).toHaveBeenCalledWith({ value: 2, exact: false });
});

it('чекбокс «Точное совпадение» переключает exact', () => {
  const onChange = vi.fn();
  render(<BedroomsControl value={2} exact={false} onChange={onChange} />);
  fireEvent.click(screen.getByRole('checkbox'));
  expect(onChange).toHaveBeenCalledWith({ value: 2, exact: true });
});

it('клик по уже выбранной pill снимает выбор (value → undefined)', () => {
  const onChange = vi.fn();
  render(<BedroomsControl value={3} exact={false} onChange={onChange} />);
  fireEvent.click(screen.getByRole('button', { name: '3+' }));
  expect(onChange).toHaveBeenCalledWith({ value: undefined, exact: false });
});

it('«Любое» выставляет value=undefined', () => {
  const onChange = vi.fn();
  render(<BedroomsControl value={2} exact={false} onChange={onChange} />);
  // Кнопка «Любое» = ключ search.filters.any через мок
  fireEvent.click(screen.getByRole('button', { name: 'search.filters.any' }));
  expect(onChange).toHaveBeenCalledWith({ value: undefined, exact: false });
});

it('по умолчанию active у «Любое», если value=undefined', () => {
  render(<BedroomsControl value={undefined} exact={false} onChange={vi.fn()} />);
  const anyBtn = screen.getByRole('button', { name: 'search.filters.any' });
  // active-Pill получает классы border-ink bg-ink
  expect(anyBtn.className).toContain('bg-ink');
});

it('рендерит все 5 вариантов + «Любое»', () => {
  render(<BedroomsControl value={undefined} exact={false} onChange={vi.fn()} />);
  expect(screen.getByRole('button', { name: '1+' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '5+' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'search.filters.any' })).toBeInTheDocument();
});
