/**
 * RegionDistrictSelect — тесты каскадного компонента «Регион → Район».
 *
 * Стратегия: мокаем Dropdown-примитивы (Radix-портал), чтобы контент всегда
 * был виден в jsdom и можно было кликать по опциям напрямую.
 */
import * as React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ru from '../../../messages/ru.json';

// Мок Dropdown: рендерим контент сразу, без Radix-портала и pointer-механики.
vi.mock('@/components/ui/dropdown', () => ({
  Dropdown: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownTrigger: ({ children, asChild: _a }: { children: React.ReactNode; asChild?: boolean }) => (
    <>{children}</>
  ),
  DropdownContent: ({ children }: { children: React.ReactNode; [k: string]: unknown }) => (
    <div>{children}</div>
  ),
}));

vi.mock('next-intl', () => {
  // Резолвер ключей из ru.json (тот же паттерн, что ListingNew.test.tsx).
  const resolve = (ns: string) => (key: string): string => {
    const root = (ru as Record<string, unknown>)[ns] as Record<string, unknown>;
    const val = key
      .split('.')
      .reduce(
        (o: unknown, k: string) =>
          o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined,
        root,
      );
    return typeof val === 'string' ? val : key;
  };
  return { useTranslations: resolve, useLocale: () => 'ru' };
});

import { RegionDistrictSelect } from './RegionDistrictSelect';

// ── Тестовые данные ───────────────────────────────────────────────────────────

const REGIONS = [
  { id: 'r1', name: 'Ташкент', code: 'TASHKENT_CITY' },
  { id: 'r2', name: 'Самарканд', code: 'SAMARKAND' },
];

const DISTRICTS = [
  { id: 'd1', name: 'Юнусабад', regionId: 'r1' },
  { id: 'd2', name: 'Мирзо-Улугбек', regionId: 'r1' },
  { id: 'd3', name: 'Ургут', regionId: 'r2' },
];

// ── Тесты ─────────────────────────────────────────────────────────────────────

describe('RegionDistrictSelect', () => {
  it('рендерит регионы; выбор региона вызывает onChange({ regionId, districtId: undefined })', () => {
    const onChange = vi.fn();
    render(
      <RegionDistrictSelect
        regions={REGIONS}
        districts={DISTRICTS}
        onChange={onChange}
      />,
    );

    // Все регионы видны в списке
    expect(screen.getByText('Ташкент')).toBeInTheDocument();
    expect(screen.getByText('Самарканд')).toBeInTheDocument();

    // Выбор первого региона
    fireEvent.click(screen.getByTestId('region-option-r1'));
    expect(onChange).toHaveBeenCalledWith({ regionId: 'r1', districtId: undefined });
  });

  it('кнопка «Район» задизейблена пока не выбран регион', () => {
    render(
      <RegionDistrictSelect
        regions={REGIONS}
        districts={DISTRICTS}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByTestId('district-trigger')).toBeDisabled();
  });

  it('после выбора региона показывает только его районы; выбор района вызывает onChange', () => {
    const onChange = vi.fn();
    render(
      <RegionDistrictSelect
        regions={REGIONS}
        districts={DISTRICTS}
        regionId="r1"
        onChange={onChange}
      />,
    );

    // Только районы r1 видны
    expect(screen.getByText('Юнусабад')).toBeInTheDocument();
    expect(screen.getByText('Мирзо-Улугбек')).toBeInTheDocument();
    expect(screen.queryByText('Ургут')).toBeNull();

    // Выбор района
    fireEvent.click(screen.getByTestId('district-option-d1'));
    expect(onChange).toHaveBeenCalledWith({ regionId: 'r1', districtId: 'd1' });
  });
});
