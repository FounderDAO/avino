import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ru from '../../../messages/ru.json';

vi.mock('next-intl', () => ({ useTranslations: (ns: string) => (k: string) => (ru as any)[ns]?.tours?.[k.replace('tours.', '')] ?? (ru as any)[ns]?.[k] ?? k }));

import { ToursSection } from './ToursSection';

describe('ToursSection', () => {
  it('включение тоггла добавляет первое окно и эмитит enabled+window', () => {
    const onChange = vi.fn();
    render(<ToursSection enabled={false} windows={[]} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText(ru.listingEdit.tours.enable));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ enabled: true }));
    expect(onChange.mock.calls.at(-1)![0].windows.length).toBeGreaterThanOrEqual(1);
  });

  it('добавляет окно', () => {
    const onChange = vi.fn();
    render(<ToursSection enabled windows={[{ start: '07:00', end: '10:00' }]} onChange={onChange} />);
    fireEvent.click(screen.getByText(ru.listingEdit.tours.addWindow));
    expect(onChange.mock.calls.at(-1)![0].windows.length).toBe(2);
  });

  it('удаляет окно', () => {
    const onChange = vi.fn();
    render(<ToursSection enabled windows={[{ start: '07:00', end: '10:00' }, { start: '18:00', end: '20:00' }]} onChange={onChange} />);
    fireEvent.click(screen.getAllByText(ru.listingEdit.tours.remove)[0]);
    expect(onChange.mock.calls.at(-1)![0].windows.length).toBe(1);
  });
});
