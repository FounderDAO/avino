/**
 * AmenitiesMultiSelect.test.tsx — юнит-тесты мультивыбора удобств (ADR-0111).
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { it, expect, vi } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import { AmenitiesMultiSelect } from './AmenitiesMultiSelect';

const msgs = {
  enums: {
    amenities: {
      AIR_CONDITIONING: 'Кондиционер',
      FURNITURE: 'Мебель',
      APPLIANCES: 'Бытовая техника',
      INTERNET: 'Интернет',
      ELEVATOR: 'Лифт',
      BALCONY: 'Балкон',
      HEATING: 'Отопление',
      SECURITY: 'Видеонаблюдение',
    },
  },
  search: { filters: { deselectAll: 'Снять все' } },
};

function setup(value: string[] = [], onChange = vi.fn()) {
  render(
    <NextIntlClientProvider locale="ru" messages={msgs}>
      <AmenitiesMultiSelect value={value as never} onChange={onChange} />
    </NextIntlClientProvider>,
  );
  return onChange;
}

it('клик по «Лифт» добавляет ELEVATOR', () => {
  const onChange = setup([]);
  fireEvent.click(screen.getByText('Лифт'));
  expect(onChange).toHaveBeenCalledWith(['ELEVATOR']);
});

it('повторный клик убирает удобство', () => {
  const onChange = setup(['ELEVATOR']);
  fireEvent.click(screen.getByText('Лифт'));
  expect(onChange).toHaveBeenCalledWith([]);
});

it('кнопка «Снять все» снимает все значения', () => {
  const onChange = setup(['ELEVATOR', 'INTERNET']);
  fireEvent.click(screen.getByText('Снять все'));
  expect(onChange).toHaveBeenCalledWith([]);
});
