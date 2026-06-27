/**
 * Тесты для BathroomsControl.
 *
 * Мокируем next-intl (useTranslations) по образцу BedroomsControl.test.tsx.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { it, expect, vi } from 'vitest';
import { BathroomsControl } from './BathroomsControl';

// ── Мок next-intl ─────────────────────────────────────────────────────────────

vi.mock('next-intl', () => ({
  useTranslations: (ns?: string) =>
    (key: string) =>
      ns ? `${ns}.${key}` : key,
}));

// ── Тесты ─────────────────────────────────────────────────────────────────────

it('клик «2+» вызывает onChange(2)', () => {
  const onChange = vi.fn();
  render(<BathroomsControl value={undefined} onChange={onChange} />);
  fireEvent.click(screen.getByText('2+'));
  expect(onChange).toHaveBeenCalledWith(2);
});

it('повторный клик по выбранному снимает выбор (undefined)', () => {
  const onChange = vi.fn();
  render(<BathroomsControl value={2} onChange={onChange} />);
  fireEvent.click(screen.getByText('2+'));
  expect(onChange).toHaveBeenCalledWith(undefined);
});
