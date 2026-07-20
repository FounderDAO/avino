/**
 * AmenityChips.test.tsx — чипы удобств detail-страницы (Task 5, динамический
 * справочник GET /amenities). Компонент серверный и чистый — справочник
 * приходит пропом, поэтому рендерится напрямую, без Provider и моков сети.
 */
import { render, screen } from '@testing-library/react';
import { it, expect } from 'vitest';
import { AmenityChips } from './AmenityChips';
import type { AmenityOption } from '@/lib/amenities';

const OPTIONS: AmenityOption[] = [
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
];

it('рендерит лейблы удобств по локали', () => {
  render(<AmenityChips codes={['INTERNET', 'ELEVATOR']} options={OPTIONS} locale="ru" />);
  expect(screen.getByText('Интернет')).toBeInTheDocument();
  expect(screen.getByText('Лифт')).toBeInTheDocument();
});

it('на en-локали берёт label_en', () => {
  render(<AmenityChips codes={['ELEVATOR']} options={OPTIONS} locale="en" />);
  expect(screen.getByText('Elevator')).toBeInTheDocument();
});

it('код вне активного справочника (скрыт админом) не рендерится', () => {
  render(<AmenityChips codes={['INTERNET', 'POOL']} options={OPTIONS} locale="ru" />);
  expect(screen.getByText('Интернет')).toBeInTheDocument();
  expect(screen.queryByText('POOL')).not.toBeInTheDocument();
});

it('пустой справочник (деградация SSR-фетча) не роняет рендер', () => {
  const { container } = render(
    <AmenityChips codes={['INTERNET']} options={[]} locale="ru" />,
  );
  expect(container.querySelectorAll('span')).toHaveLength(0);
});

it('парковка рендерится отдельным чипом с готовым лейблом', () => {
  render(
    <AmenityChips
      codes={[]}
      options={OPTIONS}
      locale="ru"
      parkingType="GARAGE"
      parkingLabel="Гараж"
    />,
  );
  expect(screen.getByText('Гараж')).toBeInTheDocument();
});
