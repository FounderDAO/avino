/**
 * ParkingMultiSelect.test.tsx — юнит-тесты мультивыбора типов парковки.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { it, expect, vi } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import { ParkingMultiSelect } from './ParkingMultiSelect';

const msgs = {
  enums: { parking: { YARD: 'Двор', COVERED: 'Крытая', GARAGE: 'Гараж', UNDERGROUND: 'Подземная' } },
  search: { filters: { deselectAll: 'Снять все' } },
};

function setup(value: string[] = [], onChange = vi.fn()) {
  render(
    <NextIntlClientProvider locale="ru" messages={msgs}>
      <ParkingMultiSelect value={value as never} onChange={onChange} />
    </NextIntlClientProvider>,
  );
  return onChange;
}

it('клик по «Гараж» добавляет GARAGE', () => {
  const onChange = setup([]);
  fireEvent.click(screen.getByText('Гараж'));
  expect(onChange).toHaveBeenCalledWith(['GARAGE']);
});

it('повторный клик убирает тип', () => {
  const onChange = setup(['GARAGE']);
  fireEvent.click(screen.getByText('Гараж'));
  expect(onChange).toHaveBeenCalledWith([]);
});
