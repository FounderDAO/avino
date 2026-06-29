/**
 * LegalConsentModal — блокирующая модалка согласия:
 *  - кнопка disabled, пока не отмечены обе галочки;
 *  - submit шлёт { terms_accepted: true, privacy_accepted: true };
 *  - ссылки на /legal/terms и /legal/privacy (target=_blank);
 *  - блокирующая: нет кнопки закрытия.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('next-intl', async () => {
  const ru = (await import('../../../messages/ru.json')).default as Record<string, unknown>;
  const useTranslations =
    (ns: string) =>
    (key: string, vars?: Record<string, unknown>): string => {
      const root = (ns ? ru[ns] : ru) as Record<string, unknown>;
      const val = key.split('.').reduce<unknown>(
        (o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined),
        root,
      );
      if (typeof val !== 'string') return key;
      return vars ? val.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? '')) : val;
    };
  return { useTranslations };
});

vi.mock('@/i18n/navigation', () => ({
  Link: ({ children, ...props }: { children?: React.ReactNode }) => <a {...props}>{children}</a>,
}));

const acceptSpy = vi.fn(() => ({ unwrap: () => Promise.resolve({ accepted_version: 1, accepted_at: 'x' }) }));
const idleState = { isLoading: false, error: undefined, reset: vi.fn() };
vi.mock('@/store/api/usersApi', () => ({
  useAcceptLegalConsentMutation: () => [acceptSpy, idleState],
}));

import { LegalConsentModal } from './LegalConsentModal';

describe('LegalConsentModal', () => {
  beforeEach(() => acceptSpy.mockClear());

  it('кнопка disabled, пока не отмечены обе галочки', async () => {
    const user = userEvent.setup();
    render(<LegalConsentModal />);
    const accept = screen.getByRole('button', { name: 'Согласен и продолжить' });
    expect(accept).toBeDisabled();

    const boxes = screen.getAllByRole('checkbox');
    await user.click(boxes[0]);
    expect(accept).toBeDisabled();
    await user.click(boxes[1]);
    expect(accept).toBeEnabled();
  });

  it('submit шлёт обе галочки true', async () => {
    const user = userEvent.setup();
    render(<LegalConsentModal />);
    for (const b of screen.getAllByRole('checkbox')) await user.click(b);
    await user.click(screen.getByRole('button', { name: 'Согласен и продолжить' }));
    expect(acceptSpy).toHaveBeenCalledWith({ terms_accepted: true, privacy_accepted: true });
  });

  it('ссылки ведут на юр-страницы в новой вкладке', () => {
    render(<LegalConsentModal />);
    const terms = screen.getByRole('link', { name: 'Правила пользования' });
    const privacy = screen.getByRole('link', { name: 'Политику конфиденциальности' });
    expect(terms).toHaveAttribute('href', '/legal/terms');
    expect(terms).toHaveAttribute('target', '_blank');
    expect(privacy).toHaveAttribute('href', '/legal/privacy');
    expect(privacy).toHaveAttribute('target', '_blank');
  });

  it('блокирующая: нет кнопки закрытия', () => {
    render(<LegalConsentModal />);
    expect(screen.queryByRole('button', { name: /закрыть|close/i })).toBeNull();
  });
});
