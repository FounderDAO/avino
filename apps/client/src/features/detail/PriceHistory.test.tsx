/**
 * Тесты PriceHistory (ADR-0121): пустая история → null, первая запись —
 * «Опубликовано» без дельты, дельта в % между соседними записями,
 * дельта не считается при смене валюты.
 */
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { PriceHistory } from './PriceHistory';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'ru',
}));
vi.mock('@/lib/usePriceFormatter', () => ({
  usePriceFormatter: () => ({
    display: 'USD',
    price: (l: { price: string }) => `$${l.price}`,
    pin: () => '',
  }),
}));

const E = (price: string, createdAt: string, currency: 'USD' | 'UZS' = 'USD') => ({
  price,
  currency,
  createdAt,
});

describe('PriceHistory', () => {
  it('ничего не рендерит без истории', () => {
    const { container } = render(
      <PriceHistory listing={{ tx: 'SALE', priceHistory: [] }} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('одна запись — «Опубликовано», без дельты', () => {
    render(
      <PriceHistory
        listing={{ tx: 'SALE', priceHistory: [E('10000.00', '2026-06-01T00:00:00Z')] }}
      />,
    );
    expect(screen.getByText('priceHistory.title')).toBeInTheDocument();
    expect(screen.getByText('priceHistory.listed')).toBeInTheDocument();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });

  it('две записи — снижение −2.0 %', () => {
    render(
      <PriceHistory
        listing={{
          tx: 'SALE',
          priceHistory: [
            E('10000.00', '2026-06-01T00:00:00Z'),
            E('9800.00', '2026-07-01T00:00:00Z'),
          ],
        }}
      />,
    );
    expect(screen.getByText('priceHistory.changed')).toBeInTheDocument();
    expect(screen.getByText(/−2\.0\s?%/)).toBeInTheDocument();

    // Новые сверху: первая строка таблицы — свежая запись (9800), последняя — «Опубликовано».
    const rows = screen.getAllByRole('row');
    expect(rows[0]).toHaveTextContent('$9800.00');
    expect(rows[rows.length - 1]).toHaveTextContent('priceHistory.listed');
  });

  it('смена валюты — дельта не считается', () => {
    render(
      <PriceHistory
        listing={{
          tx: 'SALE',
          priceHistory: [
            E('10000.00', '2026-06-01T00:00:00Z', 'USD'),
            E('126000000.00', '2026-07-01T00:00:00Z', 'UZS'),
          ],
        }}
      />,
    );
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });
});
