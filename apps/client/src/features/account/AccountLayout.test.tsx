import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ru from '../../../messages/ru.json';

vi.mock('@/store/useUnreadCounts', () => ({
  useUnreadCounts: () => ({ messages: 2, notifications: 4, tours: 1, total: 7 }),
}));
vi.mock('@/store/hooks', () => ({ useAppSelector: () => undefined }));
vi.mock('@/i18n/navigation', () => ({
  Link: (p: any) => <a href={p.href}>{p.children}</a>,
}));
vi.mock('next-intl', () => ({
  useTranslations: (ns: string) => (k: string) =>
    k.split('.').reduce((o: any, p) => o?.[p], (ru as any)[ns]) ?? k,
}));

import { AccountLayout } from './AccountLayout';

describe('AccountLayout — бейджи вкладок', () => {
  it('показывает счётчики у inbox / notifications / tours', () => {
    render(
      <AccountLayout tab="inbox">
        <div />
      </AccountLayout>,
    );
    expect(screen.getByText('2')).toBeInTheDocument(); // сообщения (inbox)
    expect(screen.getByText('4')).toBeInTheDocument(); // уведомления
    expect(screen.getByText('1')).toBeInTheDocument(); // туры (PENDING)
  });
});
