/**
 * BecomeAgentButton — CTA «Стать агентом» в шапке.
 * Слои Redux / RTK Query / i18n-навигация замоканы (харнесс ProfileMenu.test):
 * проверяем ПРАВИЛО видимости, а не сеть.
 */
import * as React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';

type QuotaResult = { data?: { used: number; limit: number; blocked: boolean } };
type ApplicationResult = { data?: { status: string } | null };

// Управляемое состояние стора для useAppSelector(<реальный селектор>).
let mockState: {
  auth: {
    accessToken: string | null;
    user: { roles: string[] } | null;
    status: string;
  };
};
let mockQuota: QuotaResult;
let mockApplication: ApplicationResult;
/** Аргументы последнего вызова useGetListingQuotaQuery (проверяем skip). */
let quotaOptions: { skip?: boolean } | undefined;
/** Аргументы последнего вызова useGetMyAgentApplicationQuery (проверяем skip). */
let applicationOptions: { skip?: boolean } | undefined;

vi.mock('next-intl', async () => {
  const ru = (await import('../../../messages/ru.json')).default as Record<
    string,
    unknown
  >;
  const useTranslations =
    (ns: string) =>
    (key: string): string => {
      const root = (ns ? ru[ns] : ru) as Record<string, unknown>;
      const val = key
        .split('.')
        .reduce<unknown>(
          (o, k) =>
            o && typeof o === 'object'
              ? (o as Record<string, unknown>)[k]
              : undefined,
          root,
        );
      return typeof val === 'string' ? val : key;
    };
  return { useTranslations };
});

vi.mock('@/i18n/navigation', () => ({
  Link: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock('@/store/hooks', () => ({
  useAppSelector: (sel: (s: unknown) => unknown) => sel(mockState),
}));

vi.mock('@/store/api/listingsQuotaApi', () => ({
  useGetListingQuotaQuery: (_arg: undefined, options?: { skip?: boolean }) => {
    quotaOptions = options;
    return options?.skip ? {} : mockQuota;
  },
}));

vi.mock('@/store/api/agentApplicationsApi', () => ({
  useGetMyAgentApplicationQuery: (
    _arg: undefined,
    options?: { skip?: boolean },
  ) => {
    applicationOptions = options;
    return options?.skip ? {} : mockApplication;
  },
}));

import { BecomeAgentButton } from './BecomeAgentButton';

beforeEach(() => {
  mockState = {
    auth: { accessToken: 'access', user: { roles: ['CLIENT'] }, status: 'authenticated' },
  };
  mockQuota = { data: { used: 1, limit: 2, blocked: false } };
  mockApplication = { data: null }; // заявок ещё не было
  quotaOptions = undefined;
  applicationOptions = undefined;
});

afterEach(() => vi.clearAllMocks());

const link = () => screen.queryByRole('link', { name: 'Стать агентом' });

describe('BecomeAgentButton', () => {
  it('показывает ссылку на /become-agent, когда есть хотя бы одно объявление', () => {
    render(<BecomeAgentButton />);
    expect(link()).toHaveAttribute('href', '/become-agent');
  });

  it('гостю ничего не рендерит и не дёргает защищённую квоту', () => {
    mockState.auth = { accessToken: null, user: null, status: 'unauthenticated' };
    render(<BecomeAgentButton />);
    expect(link()).not.toBeInTheDocument();
    expect(quotaOptions?.skip).toBe(true);
  });

  it('скрыт, пока объявлений нет (used = 0)', () => {
    mockQuota = { data: { used: 0, limit: 2, blocked: false } };
    render(<BecomeAgentButton />);
    expect(link()).not.toBeInTheDocument();
  });

  it('скрыт у агента и не дёргает квоту (роль AGENT)', () => {
    mockState.auth.user = { roles: ['CLIENT', 'AGENT'] };
    mockQuota = { data: { used: 3, limit: 2, blocked: true } };
    render(<BecomeAgentButton />);
    expect(link()).not.toBeInTheDocument();
    expect(quotaOptions?.skip).toBe(true);
  });

  it('скрыт у агентства (роль AGENCY)', () => {
    mockState.auth.user = { roles: ['AGENCY'] };
    render(<BecomeAgentButton />);
    expect(link()).not.toBeInTheDocument();
  });

  it('не мигает, пока квота ещё грузится', () => {
    mockQuota = {};
    render(<BecomeAgentButton />);
    expect(link()).not.toBeInTheDocument();
  });

  it('не запрашивает заявку, пока кнопка всё равно не видна (used = 0)', () => {
    mockQuota = { data: { used: 0, limit: 2, blocked: false } };
    render(<BecomeAgentButton />);
    expect(applicationOptions?.skip).toBe(true);
  });

  describe('заявка подана (PENDING)', () => {
    beforeEach(() => {
      mockApplication = { data: { status: 'PENDING' } };
    });

    it('вместо ссылки показывает неактивную кнопку с подсказкой', () => {
      render(<BecomeAgentButton />);
      expect(link()).not.toBeInTheDocument();

      const btn = screen.getByRole('button', { name: 'Стать агентом' });
      expect(btn).toHaveAttribute('aria-disabled', 'true');
      expect(btn).toHaveAttribute(
        'title',
        'Заявка на рассмотрении — дождитесь решения',
      );
    });

    it('по требованию показывает подсказку текстом (мобильное меню — нет hover)', () => {
      render(<BecomeAgentButton withHintText />);
      expect(
        screen.getByText('Заявка на рассмотрении — дождитесь решения'),
      ).toBeInTheDocument();
    });
  });

  it('после отказа (REJECTED) снова ведёт на форму повторной подачи', () => {
    mockApplication = { data: { status: 'REJECTED' } };
    render(<BecomeAgentButton />);
    expect(link()).toHaveAttribute('href', '/become-agent');
  });

  it('скрыт при APPROVED, даже если роли ещё не подтянулись', () => {
    mockApplication = { data: { status: 'APPROVED' } };
    render(<BecomeAgentButton />);
    expect(link()).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Стать агентом' }),
    ).not.toBeInTheDocument();
  });
});
