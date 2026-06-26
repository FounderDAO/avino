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

  it('показывает количество дней на сайте', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-26T00:00:00.000Z'));
    render(<DaysBadge createdAt="2026-06-21T00:00:00.000Z" />);
    expect(screen.getByText('daysOnSite:{"count":5}')).toBeInTheDocument();
  });
});
