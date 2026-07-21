/**
 * AmenitiesMultiSelect.test.tsx — юнит-тесты мультивыбора удобств
 * (ADR-0111; Task 5 — динамический справочник GET /amenities).
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { it, expect, vi } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import { AmenitiesMultiSelect } from './AmenitiesMultiSelect';

vi.mock('@/store/api/amenitiesApi', () => ({
  useListAmenitiesQuery: () => ({
    data: [
      {
        id: '1',
        code: 'INTERNET',
        label_ru: 'Интернет',
        label_uz: 'Internet',
        label_en: 'Internet',
        sort_order: 0,
      },
      {
        id: '2',
        code: 'ELEVATOR',
        label_ru: 'Лифт',
        label_uz: 'Lift',
        label_en: 'Elevator',
        sort_order: 1,
      },
    ],
    isLoading: false,
  }),
}));

const msgs = {
  search: { filters: { deselectAll: 'Снять все' } },
};

function setup(value: string[] = [], onChange = vi.fn()) {
  render(
    <NextIntlClientProvider locale="ru" messages={msgs}>
      <AmenitiesMultiSelect value={value} onChange={onChange} />
    </NextIntlClientProvider>,
  );
  return onChange;
}

it('рендерит лейблы из справочника и клик по «Лифт» добавляет ELEVATOR', () => {
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
