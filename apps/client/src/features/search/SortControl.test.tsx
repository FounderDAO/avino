/**
 * SortControl — тесты.
 *
 * Сорт теперь клиентское Redux-состояние: смена НЕ вызывает навигацию, а
 * диспатчит setSort и обновляет URL shallow-навигацией (history.replaceState).
 *
 * Мокируем:
 * - next/navigation (useSearchParams) — источник начального значения (hydrate)
 * - next-intl (useTranslations) — key→key резолвер
 * Оборачиваем в реальный Redux-store (makeStore).
 */
import * as React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Provider } from 'react-redux';
import { makeStore } from '@/store/store';

let mockSearchParamsStr = 'tx=SALE';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(mockSearchParamsStr),
}));

vi.mock('next-intl', () => ({
  useTranslations: (ns?: string) => (key: string) => (ns ? `${ns}.${key}` : key),
}));

// Импорт ПОСЛЕ моков
import { SortControl } from './SortControl';

function renderWithStore() {
  return render(
    <Provider store={makeStore()}>
      <SortControl />
    </Provider>,
  );
}

let replaceSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  mockSearchParamsStr = 'tx=SALE';
  replaceSpy = vi.spyOn(window.history, 'replaceState').mockImplementation(() => {});
});

describe('SortControl', () => {
  it('рендерится без ошибок', () => {
    const { container } = renderWithStore();
    expect(container).toBeTruthy();
  });

  it('показывает <select> с aria-label из i18n', () => {
    renderWithStore();
    expect(
      screen.getByRole('combobox', { name: /search\.filters\.sortAria/i }),
    ).toBeInTheDocument();
  });

  it('отображает все 5 опций сортировки', () => {
    renderWithStore();
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(Array.from(select.options)).toHaveLength(5);
  });

  it('по умолчанию выбрана опция «promotion» (URL без sort=)', () => {
    renderWithStore();
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select.value).toBe('promotion');
  });

  it('восстанавливает значение sort из URL (hydrate)', () => {
    mockSearchParamsStr = 'tx=SALE&sort=price_asc';
    renderWithStore();
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select.value).toBe('price_asc');
  });

  it('смена значения обновляет UI и пишет sort в URL shallow (без навигации)', () => {
    renderWithStore();
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'price_asc' } });
    // Redux обновился → контролируемое значение select новое.
    expect(select.value).toBe('price_asc');
    // URL обновлён shallow (history.replaceState), не router-навигацией.
    expect(replaceSpy).toHaveBeenCalledOnce();
    const url = replaceSpy.mock.calls[0][2] as string;
    expect(url).toContain('sort=price_asc');
  });

  it('смена на «promotion» удаляет параметр sort из URL', () => {
    mockSearchParamsStr = 'tx=SALE&sort=price_desc';
    renderWithStore();
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'promotion' } });
    expect(select.value).toBe('promotion');
    expect(replaceSpy).toHaveBeenCalledOnce();
    const url = replaceSpy.mock.calls[0][2] as string;
    expect(url).not.toContain('sort=');
  });
});
