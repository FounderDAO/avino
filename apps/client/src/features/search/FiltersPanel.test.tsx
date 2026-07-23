/**
 * Тесты для FiltersPanel — мега-панель «Фильтры».
 *
 * Мокируем:
 * - next-intl (useTranslations) — key→key (без перевода), устойчиво к mock
 * - Кнопки находим по data-testid, не по русскому тексту
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FiltersPanel } from './FiltersPanel';
import type { FiltersPanelValues } from './FiltersPanel';

// ── Мок next-intl: t(key) → key (без namespace-префикса, как в соседних тестах) ──
vi.mock('next-intl', () => ({
  useTranslations: (_ns?: string) => {
    return (key: string) => key;
  },
  useLocale: () => 'ru',
}));

// AmenitiesMultiSelect (вложен в FiltersPanel) тянет справочник GET /amenities.
vi.mock('@/store/api/amenitiesApi', () => ({
  useListAmenitiesQuery: () => ({ data: [], isLoading: false }),
}));

// ── Тестовые данные ────────────────────────────────────────────────────────────

const emptyValues: FiltersPanelValues = {};

// ── Тесты ──────────────────────────────────────────────────────────────────────

describe('FiltersPanel', () => {
  it('рендерит панель без ошибок с пустыми values', () => {
    const onApply = vi.fn();
    const onReset = vi.fn();
    render(
      <FiltersPanel values={emptyValues} onApply={onApply} onReset={onReset} />,
    );
    // Кнопки присутствуют
    expect(screen.getByTestId('filters-apply')).toBeInTheDocument();
    expect(screen.getByTestId('filters-reset')).toBeInTheDocument();
  });

  it('ввод площади «от» и клик «Применить» вызывает onApply с areaMin', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    const onReset = vi.fn();

    render(
      <FiltersPanel values={emptyValues} onApply={onApply} onReset={onReset} />,
    );

    // Первая пара textbox-ов — это поля площади (areaMin / areaMax).
    const textboxes = screen.getAllByRole('textbox');
    const areaMinInput = textboxes[0];

    // Вводим значение и фаерим blur (RangeFields коммитит по onBlur)
    await user.clear(areaMinInput);
    await user.type(areaMinInput, '40');
    fireEvent.blur(areaMinInput);

    // Клик «Применить»
    await user.click(screen.getByTestId('filters-apply'));

    expect(onApply).toHaveBeenCalledOnce();
    const callArg = onApply.mock.calls[0][0] as FiltersPanelValues;
    expect(callArg).toMatchObject({ areaMin: '40' });
  });

  it('клик «Сбросить всё» вызывает onReset', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    const onReset = vi.fn();

    render(
      <FiltersPanel
        values={{ areaMin: '10', yearMax: '2020' }}
        onApply={onApply}
        onReset={onReset}
      />,
    );

    await user.click(screen.getByTestId('filters-reset'));
    expect(onReset).toHaveBeenCalledOnce();
  });

  it('после сброса черновик обнуляется (onApply с пустым объектом)', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    const onReset = vi.fn();

    render(
      <FiltersPanel
        values={{ areaMin: '10' }}
        onApply={onApply}
        onReset={onReset}
      />,
    );

    // Сброс
    await user.click(screen.getByTestId('filters-reset'));

    // Применяем — черновик должен быть пустым
    await user.click(screen.getByTestId('filters-apply'));
    const callArg = onApply.mock.calls[0][0] as FiltersPanelValues;
    expect(callArg.areaMin).toBeUndefined();
  });

  it('чекбокс notFirstFloor переключается', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    const onReset = vi.fn();

    render(
      <FiltersPanel values={emptyValues} onApply={onApply} onReset={onReset} />,
    );

    // Находим чекбокс по aria-label его label или по позиции среди checkboxes
    const checkboxes = screen.getAllByRole('checkbox');
    // порядок: newConstruction (0), notFirstFloor (1), notLastFloor (2), sourceOwner (3), sourceAgency (4), toursEnabled (5)
    const notFirstFloor = checkboxes[1];
    expect(notFirstFloor).not.toBeChecked();

    await user.click(notFirstFloor);
    expect(notFirstFloor).toBeChecked();

    await user.click(screen.getByTestId('filters-apply'));
    const callArg = onApply.mock.calls[0][0] as FiltersPanelValues;
    expect(callArg.notFirstFloor).toBe(true);
  });

  it('чекбокс «Новостройка» эмитит newConstruction=true', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();

    render(
      <FiltersPanel values={emptyValues} onApply={onApply} onReset={vi.fn()} />,
    );

    const newConstruction = screen.getAllByRole('checkbox')[0];
    await user.click(newConstruction);
    expect(newConstruction).toBeChecked();

    await user.click(screen.getByTestId('filters-apply'));
    expect((onApply.mock.calls[0][0] as FiltersPanelValues).newConstruction).toBe(true);
  });

  it('listingSource — мультивыбор: можно выбрать оба источника', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    const onReset = vi.fn();

    render(
      <FiltersPanel values={emptyValues} onApply={onApply} onReset={onReset} />,
    );

    const checkboxes = screen.getAllByRole('checkbox');
    const sourceOwner = checkboxes[3]; // 0=newConstruction, 1=notFirst, 2=notLast, 3=owner
    const sourceAgency = checkboxes[4];

    // Выбираем оба источника
    await user.click(sourceOwner);
    await user.click(sourceAgency);
    expect(sourceOwner).toBeChecked();
    expect(sourceAgency).toBeChecked();

    // Применяем — в draft оба значения
    await user.click(screen.getByTestId('filters-apply'));
    expect((onApply.mock.calls[0][0] as FiltersPanelValues).listingSource).toEqual([
      'OWNER',
      'AGENCY',
    ]);
    onApply.mockClear();

    // Повторный клик по «Собственник» — снимает только его
    await user.click(sourceOwner);
    await user.click(screen.getByTestId('filters-apply'));
    expect((onApply.mock.calls[0][0] as FiltersPanelValues).listingSource).toEqual([
      'AGENCY',
    ]);
    onApply.mockClear();

    // Снимаем последний — фильтр пустой
    await user.click(sourceAgency);
    await user.click(screen.getByTestId('filters-apply'));
    expect((onApply.mock.calls[0][0] as FiltersPanelValues).listingSource).toBeUndefined();
  });

  it('useEffect ресинкает draft при изменении values prop', () => {
    const onApply = vi.fn();
    const onReset = vi.fn();

    const { rerender } = render(
      <FiltersPanel values={emptyValues} onApply={onApply} onReset={onReset} />,
    );

    // Перерендер с новыми values
    rerender(
      <FiltersPanel
        values={{ areaMin: '50' }}
        onApply={onApply}
        onReset={onReset}
      />,
    );

    // Первое textbox-поле должно содержать '50'
    const areaMinInput = screen.getAllByRole('textbox')[0] as HTMLInputElement;
    expect(areaMinInput.value).toBe('50');
  });
});
