import * as React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DaysBadge } from './promo-badge';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, vars?: Record<string, unknown>) =>
    vars ? `${key}:${JSON.stringify(vars)}` : key,
}));

describe('DaysBadge', () => {
  afterEach(() => vi.useRealTimers());

  const daysAgo = (n: number): string => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-26T00:00:00.000Z'));
    return new Date(Date.parse('2026-06-26T00:00:00.000Z') - n * 86_400_000).toISOString();
  };

  it('моложе суток → бейдж «Новое»', () => {
    render(<DaysBadge createdAt={daysAgo(0)} />);
    expect(screen.getByText('badgeNew')).toBeInTheDocument();
  });

  it('показывает дни на сайте', () => {
    render(<DaysBadge createdAt={daysAgo(5)} />);
    expect(screen.getByText('daysOnSite:{"count":5}')).toBeInTheDocument();
  });

  it('сворачивает в недели', () => {
    render(<DaysBadge createdAt={daysAgo(21)} />);
    expect(screen.getByText('weeksOnSite:{"count":3}')).toBeInTheDocument();
  });

  it('сворачивает в месяцы', () => {
    render(<DaysBadge createdAt={daysAgo(30)} />);
    expect(screen.getByText('monthsOnSite:{"count":1}')).toBeInTheDocument();
  });

  it('сворачивает в годы', () => {
    render(<DaysBadge createdAt={daysAgo(1000)} />);
    expect(screen.getByText('yearsOnSite:{"count":2}')).toBeInTheDocument();
  });
});
