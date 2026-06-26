/**
 * Тесты для RangeFields.
 * Мок next-intl не нужен — компонент не использует useTranslations.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { it, expect, vi } from 'vitest';
import { RangeFields } from './RangeFields';

it('коммитит min/max по blur', () => {
  const onMin = vi.fn();
  const onMax = vi.fn();
  render(
    <RangeFields
      min=""
      max=""
      onMin={onMin}
      onMax={onMax}
      fromLabel="от"
      toLabel="до"
    />,
  );
  const [from, to] = screen.getAllByRole('textbox');
  fireEvent.change(from, { target: { value: '40' } });
  fireEvent.blur(from);
  fireEvent.change(to, { target: { value: '90' } });
  fireEvent.blur(to);
  expect(onMin).toHaveBeenCalledWith('40');
  expect(onMax).toHaveBeenCalledWith('90');
});

it('не вызывает коллбэки до blur', () => {
  const onMin = vi.fn();
  const onMax = vi.fn();
  render(
    <RangeFields
      min=""
      max=""
      onMin={onMin}
      onMax={onMax}
      fromLabel="от"
      toLabel="до"
    />,
  );
  // Без blur — никаких вызовов
  expect(onMin).not.toHaveBeenCalled();
  expect(onMax).not.toHaveBeenCalled();
});

it('рендерит placeholder с suffix', () => {
  render(
    <RangeFields
      min=""
      max=""
      onMin={vi.fn()}
      onMax={vi.fn()}
      fromLabel="от"
      toLabel="до"
      suffix="м²"
    />,
  );
  expect(screen.getByPlaceholderText('от м²')).toBeInTheDocument();
  expect(screen.getByPlaceholderText('до м²')).toBeInTheDocument();
});

it('инпуты имеют inputMode="numeric"', () => {
  render(
    <RangeFields
      min=""
      max=""
      onMin={vi.fn()}
      onMax={vi.fn()}
      fromLabel="от"
      toLabel="до"
    />,
  );
  const inputs = screen.getAllByRole('textbox');
  expect(inputs[0]).toHaveAttribute('inputmode', 'numeric');
  expect(inputs[1]).toHaveAttribute('inputmode', 'numeric');
});

it('очищается при внешнем сбросе props', () => {
  const { rerender } = render(
    <RangeFields
      min="40"
      max="90"
      onMin={vi.fn()}
      onMax={vi.fn()}
      fromLabel="от"
      toLabel="до"
    />,
  );
  const [from] = screen.getAllByRole('textbox');
  expect((from as HTMLInputElement).value).toBe('40');
  rerender(
    <RangeFields
      min=""
      max=""
      onMin={vi.fn()}
      onMax={vi.fn()}
      fromLabel="от"
      toLabel="до"
    />,
  );
  expect((from as HTMLInputElement).value).toBe('');
});
