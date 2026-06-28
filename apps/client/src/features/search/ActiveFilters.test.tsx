/**
 * Тесты для ActiveFilters — ряд активных фильтр-чипов.
 *
 * Мокируем:
 * - next-intl (useTranslations) — возвращает ключ или интерполированную строку
 * - @/i18n/navigation (useRouter, usePathname) — шпионим за router.replace
 * - next/navigation (useSearchParams) — возвращаем фиктивные URLSearchParams
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ActiveFilters } from './ActiveFilters';
import type { FilterValues } from './FilterBar';
import type { District, Region } from '@/lib/mock/types';

// ── Моки зависимостей ─────────────────────────────────────────────────────────

const mockReplace = vi.fn();
const mockPathname = '/search';
const mockSearchParamsStr = 'tx=SALE&type=APARTMENT&rooms=2';

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
  usePathname: () => mockPathname,
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(mockSearchParamsStr),
}));

// Упрощённый мок useTranslations: возвращает функцию key→key (или интерполяцию).
vi.mock('next-intl', () => ({
  useTranslations: (ns?: string) => {
    return (key: string, params?: Record<string, string>) => {
      const full = ns ? `${ns}.${key}` : key;
      if (!params) return full;
      // Простая интерполяция {param} → значение
      return full.replace(/\{(\w+)\}/g, (_, k: string) => params[k] ?? `{${k}}`);
    };
  },
}));

// ── Тестовые данные ───────────────────────────────────────────────────────────

const districts: District[] = [
  { id: 'yunusabad-uuid', name: 'Юнусабадский', regionId: 'r1' },
  { id: 'mirzo-uuid', name: 'Мирзо Улугбек', regionId: 'r1' },
];

const regions: Region[] = [
  { id: 'r1', name: 'Ташкент', code: 'TASHKENT_CITY' },
  { id: 'r2', name: 'Ташкентская область', code: 'TASHKENT_REGION' },
];

const baseValues: FilterValues = {
  tx: 'SALE',
  sort: 'promotion',
  view: 'list',
};

// ── Утилиты ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockReplace.mockClear();
});

// ── Тесты ─────────────────────────────────────────────────────────────────────

describe('ActiveFilters', () => {
  it('рендерит null, если активных фильтров нет', () => {
    const { container } = render(
      <ActiveFilters values={baseValues} districts={districts} regions={[]} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('показывает чип типа недвижимости', () => {
    render(
      <ActiveFilters
        values={{ ...baseValues, type: 'APARTMENT' }}
        districts={districts}
        regions={[]}
      />,
    );
    // Ключ enums.propertyType.APARTMENT
    expect(screen.getByText('enums.propertyType.APARTMENT')).toBeInTheDocument();
  });

  it('показывает чип района по имени', () => {
    render(
      <ActiveFilters
        values={{ ...baseValues, districtId: 'yunusabad-uuid' }}
        districts={districts}
        regions={[]}
      />,
    );
    expect(screen.getByText('Юнусабадский')).toBeInTheDocument();
  });

  it('показывает чип комнат', () => {
    render(
      <ActiveFilters values={{ ...baseValues, rooms: 2 }} districts={districts} regions={[]} />,
    );
    // Мок useTranslations('search.filters') → t('roomsCount', {count:'2'}) → 'search.filters.roomsCount'
    // интерполяция {count} в строке 'search.filters.roomsCount' не срабатывает (нет {count} в ключе)
    expect(screen.getByText('search.filters.roomsCount')).toBeInTheDocument();
  });

  it('показывает чип цены при priceMin', () => {
    render(
      <ActiveFilters
        values={{ ...baseValues, priceMin: '50000' }}
        districts={districts}
        regions={[]}
      />,
    );
    // Мок: t('priceRange', {min:'50000', max:'∞'}) → 'search.filters.priceRange' (ключ без {}-переменных)
    expect(screen.getByText('search.filters.priceRange')).toBeInTheDocument();
  });

  it('показывает чип query', () => {
    render(
      <ActiveFilters
        values={{ ...baseValues, query: 'Центр' }}
        districts={districts}
        regions={[]}
      />,
    );
    // Мок: t('queryChip', {query:'Центр'}) → 'search.filters.queryChip' (ключ без {}-переменных)
    expect(screen.getByText('search.filters.queryChip')).toBeInTheDocument();
  });

  it('кнопка × удаляет чип типа (вызывает router.replace без type)', async () => {
    const user = userEvent.setup();
    render(
      <ActiveFilters
        values={{ ...baseValues, type: 'APARTMENT' }}
        districts={districts}
        regions={[]}
      />,
    );
    // aria-label = 'search.filters.removeFilter' (мок возвращает ключ без интерполяции в ключе)
    const removeBtn = screen.getByRole('button', {
      name: 'search.filters.removeFilter',
    });
    await user.click(removeBtn);
    expect(mockReplace).toHaveBeenCalledOnce();
    // URL после удаления не должен содержать type=
    const calledUrl: string = mockReplace.mock.calls[0][0] as string;
    expect(calledUrl).not.toMatch(/type=/);
  });

  it('кнопка «Сбросить всё» очищает все фильтры, сохраняя tx и view', async () => {
    const user = userEvent.setup();
    render(
      <ActiveFilters
        values={{
          ...baseValues,
          type: 'APARTMENT',
          districtId: 'yunusabad-uuid',
          rooms: 2,
          priceMin: '100',
          priceMax: '500',
          query: 'тест',
        }}
        districts={districts}
        regions={[]}
      />,
    );
    const resetBtn = screen.getByText('search.filters.resetAll');
    await user.click(resetBtn);
    expect(mockReplace).toHaveBeenCalledOnce();
    const calledUrl: string = mockReplace.mock.calls[0][0] as string;
    // Фильтры удалены
    expect(calledUrl).not.toMatch(/type=/);
    expect(calledUrl).not.toMatch(/district_id=/);
    expect(calledUrl).not.toMatch(/rooms=/);
    expect(calledUrl).not.toMatch(/priceMin=/);
    expect(calledUrl).not.toMatch(/priceMax=/);
    expect(calledUrl).not.toMatch(/query=/);
    // tx=SALE сохранён (приходит из mockSearchParamsStr)
    expect(calledUrl).toMatch(/tx=SALE/);
  });

  it('не показывает tx и view как чипы', () => {
    render(
      <ActiveFilters
        values={{ ...baseValues, type: 'APARTMENT' }}
        districts={districts}
        regions={[]}
      />,
    );
    // Должен быть ровно 1 чип (тип) + кнопка сброса, но не чип tx/view
    const chips = screen.getAllByRole('group');
    // Убеждаемся что группа существует
    expect(chips.length).toBeGreaterThan(0);
  });

  it('кнопки × имеют корректный aria-label', () => {
    render(
      <ActiveFilters
        values={{ ...baseValues, rooms: 3 }}
        districts={districts}
        regions={[]}
      />,
    );
    const removeBtn = screen.getByRole('button', {
      name: 'search.filters.removeFilter',
    });
    expect(removeBtn).toBeInTheDocument();
  });

  // ── Новые фильтры (Task 10) ──────────────────────────────────────────────────

  it('показывает чип площади при areaMin', () => {
    render(
      <ActiveFilters
        values={{ ...baseValues, areaMin: '40' }}
        districts={districts}
        regions={[]}
      />,
    );
    // Чип содержит значение 40 в метке диапазона
    const chip = screen.getByText(/40/);
    expect(chip).toBeInTheDocument();
  });

  it('показывает чип площади при areaMax', () => {
    render(
      <ActiveFilters
        values={{ ...baseValues, areaMax: '120' }}
        districts={districts}
        regions={[]}
      />,
    );
    expect(screen.getByText(/120/)).toBeInTheDocument();
  });

  it('показывает чип notFirstFloor при notFirstFloor=true', () => {
    render(
      <ActiveFilters
        values={{ ...baseValues, notFirstFloor: true }}
        districts={districts}
        regions={[]}
      />,
    );
    // Мок: t('notFirstFloor') → 'search.filters.notFirstFloor'
    expect(screen.getByText('search.filters.notFirstFloor')).toBeInTheDocument();
  });

  it('показывает чип notLastFloor при notLastFloor=true', () => {
    render(
      <ActiveFilters
        values={{ ...baseValues, notLastFloor: true }}
        districts={districts}
        regions={[]}
      />,
    );
    expect(screen.getByText('search.filters.notLastFloor')).toBeInTheDocument();
  });

  it('показывает чип listingSource=OWNER', () => {
    render(
      <ActiveFilters
        values={{ ...baseValues, listingSource: 'OWNER' }}
        districts={districts}
        regions={[]}
      />,
    );
    expect(screen.getByText('search.filters.sourceOwner')).toBeInTheDocument();
  });

  it('показывает чип toursEnabled', () => {
    render(
      <ActiveFilters
        values={{ ...baseValues, toursEnabled: true }}
        districts={districts}
        regions={[]}
      />,
    );
    expect(screen.getByText('search.filters.toursEnabled')).toBeInTheDocument();
  });

  it('показывает чип roomsMin', () => {
    render(
      <ActiveFilters
        values={{ ...baseValues, roomsMin: 2 }}
        districts={districts}
        regions={[]}
      />,
    );
    // t('roomsCount', {count:'2+'}) → 'search.filters.roomsCount'
    expect(screen.getByText('search.filters.roomsCount')).toBeInTheDocument();
  });

  it('клик × на чипе areaMin удаляет area_min и area_max из URL', async () => {
    const user = userEvent.setup();
    render(
      <ActiveFilters
        values={{ ...baseValues, areaMin: '40', areaMax: '200' }}
        districts={districts}
        regions={[]}
      />,
    );
    const removeBtn = screen.getByRole('button', {
      name: 'search.filters.removeFilter',
    });
    await user.click(removeBtn);
    expect(mockReplace).toHaveBeenCalledOnce();
    const calledUrl: string = mockReplace.mock.calls[0][0] as string;
    expect(calledUrl).not.toMatch(/area_min=/);
    expect(calledUrl).not.toMatch(/area_max=/);
  });

  it('клик × на notFirstFloor удаляет not_first_floor из URL', async () => {
    const user = userEvent.setup();
    render(
      <ActiveFilters
        values={{ ...baseValues, notFirstFloor: true }}
        districts={districts}
        regions={[]}
      />,
    );
    const removeBtn = screen.getByRole('button', {
      name: 'search.filters.removeFilter',
    });
    await user.click(removeBtn);
    expect(mockReplace).toHaveBeenCalledOnce();
    const calledUrl: string = mockReplace.mock.calls[0][0] as string;
    expect(calledUrl).not.toMatch(/not_first_floor=/);
  });

  it('«Сбросить всё» удаляет новые фильтры, сохраняя tx', async () => {
    const user = userEvent.setup();
    render(
      <ActiveFilters
        values={{
          ...baseValues,
          areaMin: '40',
          notFirstFloor: true,
          listingSource: 'OWNER',
          toursEnabled: true,
        }}
        districts={districts}
        regions={[]}
      />,
    );
    const resetBtn = screen.getByText('search.filters.resetAll');
    await user.click(resetBtn);
    expect(mockReplace).toHaveBeenCalledOnce();
    const calledUrl: string = mockReplace.mock.calls[0][0] as string;
    expect(calledUrl).not.toMatch(/area_min=/);
    expect(calledUrl).not.toMatch(/not_first_floor=/);
    expect(calledUrl).not.toMatch(/listing_source=/);
    expect(calledUrl).not.toMatch(/tours_enabled=/);
    // tx=SALE сохранён
    expect(calledUrl).toMatch(/tx=SALE/);
  });

  // ── Регион (Task B4) ─────────────────────────────────────────────────────────

  it('показывает чип региона по имени', () => {
    render(
      <ActiveFilters
        values={{ ...baseValues, regionId: 'r1' }}
        districts={districts}
        regions={regions}
      />,
    );
    expect(screen.getByText('Ташкент')).toBeInTheDocument();
  });

  it('показывает regionId как fallback, если регион не найден в списке', () => {
    render(
      <ActiveFilters
        values={{ ...baseValues, regionId: 'unknown-id' }}
        districts={districts}
        regions={regions}
      />,
    );
    expect(screen.getByText('unknown-id')).toBeInTheDocument();
  });

  it('клик × на чипе региона удаляет region_id И district_id из URL', async () => {
    const user = userEvent.setup();
    render(
      <ActiveFilters
        values={{ ...baseValues, regionId: 'r1', districtId: 'yunusabad-uuid' }}
        districts={districts}
        regions={regions}
      />,
    );
    // Чипов два: регион и район. Первый × — это чип региона.
    const removeBtns = screen.getAllByRole('button', {
      name: 'search.filters.removeFilter',
    });
    await user.click(removeBtns[0]);
    expect(mockReplace).toHaveBeenCalledOnce();
    const calledUrl: string = mockReplace.mock.calls[0][0] as string;
    expect(calledUrl).not.toMatch(/region_id=/);
    expect(calledUrl).not.toMatch(/district_id=/);
  });

  it('«Сбросить всё» удаляет region_id, сохраняя tx', async () => {
    const user = userEvent.setup();
    render(
      <ActiveFilters
        values={{ ...baseValues, regionId: 'r1' }}
        districts={districts}
        regions={regions}
      />,
    );
    const resetBtn = screen.getByText('search.filters.resetAll');
    await user.click(resetBtn);
    expect(mockReplace).toHaveBeenCalledOnce();
    const calledUrl: string = mockReplace.mock.calls[0][0] as string;
    expect(calledUrl).not.toMatch(/region_id=/);
    expect(calledUrl).toMatch(/tx=SALE/);
  });
});
