import { render, screen, fireEvent } from '@testing-library/react';
import { it, expect, vi } from 'vitest';
import { PriceRangeControl } from './PriceRangeControl';

const base = {
  domain: { min: 0, max: 1000 },
  buckets: [
    { from: 0, to: 500, count: 4 },
    { from: 500, to: 1000, count: 2 },
  ],
  minLabel: 'Мин',
  maxLabel: 'Макс',
  fromPlaceholder: 'от $',
  toPlaceholder: 'до $',
  formatLabel: (v: number) => `$${v}`,
};

it('рендерит подписи домена и два поля', () => {
  render(<PriceRangeControl {...base} value={{ min: null, max: null }} onChange={vi.fn()} />);
  expect(screen.getByText('$0')).toBeInTheDocument();
  expect(screen.getByText('$1000')).toBeInTheDocument();
  expect(screen.getByPlaceholderText('от $')).toBeInTheDocument();
  expect(screen.getByPlaceholderText('до $')).toBeInTheDocument();
});

it('ввод в поле «Мин» вызывает onChange с клампнутым значением', () => {
  const onChange = vi.fn();
  render(<PriceRangeControl {...base} value={{ min: null, max: null }} onChange={onChange} />);
  fireEvent.change(screen.getByPlaceholderText('от $'), { target: { value: '200' } });
  expect(onChange).toHaveBeenCalledWith({ min: 200, max: null });
});

it('пустое поле «Макс» возвращает max к null (без верхней границы)', () => {
  const onChange = vi.fn();
  render(<PriceRangeControl {...base} value={{ min: null, max: 800 }} onChange={onChange} />);
  fireEvent.change(screen.getByPlaceholderText('до $'), { target: { value: '' } });
  expect(onChange).toHaveBeenCalledWith({ min: null, max: null });
});
