import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SearchAutocomplete } from './SearchAutocomplete';
import type { Suggestion } from './useGeoSuggest';

const items: Suggestion[] = [
  { kind: 'district', title: 'Юнусабадский', value: 'Ташкент, Юнусабадский' },
  { kind: 'geo', title: 'Юнусабад, ул. Амира Темура', value: 'Узбекистан, Ташкент, Амира Темура' },
];

const baseProps = {
  value: 'Юну',
  items,
  loading: false,
  placeholder: 'Район, адрес…',
  ariaLabel: 'Поиск',
  labels: { districts: 'Районы', addresses: 'Адреса', empty: 'Ничего не найдено' },
};

describe('SearchAutocomplete', () => {
  it('показывает группы и опции при фокусе', async () => {
    const user = userEvent.setup();
    render(
      <SearchAutocomplete {...baseProps} onChange={() => {}} onSelect={() => {}} onSubmitRaw={() => {}} onActiveChange={() => {}} />,
    );
    await user.click(screen.getByRole('combobox'));
    expect(screen.getByText('Районы')).toBeInTheDocument();
    expect(screen.getByText('Адреса')).toBeInTheDocument();
    expect(screen.getAllByRole('option')).toHaveLength(2);
  });

  it('ArrowDown + Enter выбирает первую опцию', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <SearchAutocomplete {...baseProps} onChange={() => {}} onSelect={onSelect} onSubmitRaw={() => {}} onActiveChange={() => {}} />,
    );
    await user.click(screen.getByRole('combobox'));
    await user.keyboard('{ArrowDown}{Enter}');
    expect(onSelect).toHaveBeenCalledWith(items[0]);
  });

  it('Enter без подсветки коммитит сырой текст', async () => {
    const user = userEvent.setup();
    const onSubmitRaw = vi.fn();
    render(
      <SearchAutocomplete {...baseProps} onChange={() => {}} onSelect={() => {}} onSubmitRaw={onSubmitRaw} onActiveChange={() => {}} />,
    );
    await user.click(screen.getByRole('combobox'));
    await user.keyboard('{Enter}');
    expect(onSubmitRaw).toHaveBeenCalledWith('Юну');
  });

  it('клик по опции вызывает onSelect', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <SearchAutocomplete {...baseProps} onChange={() => {}} onSelect={onSelect} onSubmitRaw={() => {}} onActiveChange={() => {}} />,
    );
    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByText('Юнусабад, ул. Амира Темура'));
    expect(onSelect).toHaveBeenCalledWith(items[1]);
  });

  it('ArrowDown затем ArrowUp возвращает к сырому тексту (Enter → onSubmitRaw)', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onSubmitRaw = vi.fn();
    render(
      <SearchAutocomplete {...baseProps} onChange={() => {}} onSelect={onSelect} onSubmitRaw={onSubmitRaw} onActiveChange={() => {}} />,
    );
    await user.click(screen.getByRole('combobox'));
    await user.keyboard('{ArrowDown}{ArrowUp}{Enter}');
    expect(onSelect).not.toHaveBeenCalled();
    expect(onSubmitRaw).toHaveBeenCalledWith('Юну');
  });
});
