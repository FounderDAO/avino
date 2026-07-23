import * as React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ru from '../../../messages/ru.json';

/** Пользователь мок-стора; null — гость. Тесты переопределяют перед рендером. */
let mockUser: unknown = null;
let mockAccessToken: string | null = null;

beforeEach(() => {
  mockUser = null;
  mockAccessToken = null;
});

vi.mock('@/store/hooks', () => ({
  useAppSelector: (sel: unknown) =>
    (sel as (s: unknown) => unknown)({
      auth: {
        accessToken: mockAccessToken,
        user: mockUser,
        // Сессия РАЗРЕШЕНА (эти тесты не про checking-окно): гость =
        // unauthenticated, вошедший = authenticated (ADR-0153).
        status: mockAccessToken ? 'authenticated' : 'unauthenticated',
      },
    }),
}));

/** Ответ useGetMyAgentApplicationQuery. Тесты переопределяют перед рендером. */
let mockApplication: unknown = null;
let mockApplicationLoading = false;
/** Мутация submitAgentApplication — вызов и результат/ошибка. */
let mockSubmit = vi.fn();
let mockSubmitLoading = false;
let mockSubmitError: unknown = undefined;

beforeEach(() => {
  mockApplication = null;
  mockApplicationLoading = false;
  mockSubmit = vi.fn().mockResolvedValue({});
  mockSubmitLoading = false;
  mockSubmitError = undefined;
});

vi.mock('@/store/api/agentApplicationsApi', () => ({
  useGetMyAgentApplicationQuery: () => ({
    data: mockApplication,
    isLoading: mockApplicationLoading,
  }),
  useSubmitAgentApplicationMutation: () => [
    (body: unknown) => ({
      unwrap: async () => {
        if (mockSubmitError) throw mockSubmitError;
        return mockSubmit(body);
      },
    }),
    { isLoading: mockSubmitLoading, error: mockSubmitError },
  ],
}));

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
  Link: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));
vi.mock('@/components/layout/LoginModal', () => ({
  LoginModal: ({ open }: { open: boolean }) =>
    open ? <div data-testid="login-modal" /> : null,
}));
vi.mock('next-intl', () => {
  const resolve =
    (ns: string) =>
    (key: string, values?: Record<string, unknown>): string => {
      const root = (ns ? (ru as any)[ns] : ru) as any;
      const val = key
        .split('.')
        .reduce(
          (o: any, k: string) =>
            o && typeof o === 'object' ? o[k] : undefined,
          root,
        );
      if (typeof val !== 'string') return key;
      if (!values) return val;
      return Object.entries(values).reduce(
        (acc, [k, v]) => acc.replace(`{${k}}`, String(v)),
        val,
      );
    };
  return { useTranslations: resolve };
});

import { BecomeAgent } from './BecomeAgent';

const authedUser = (roles: string[] = ['USER']) => ({
  id: 'u1',
  phone: '+998901234567',
  roles,
  profile: { first_name: 'Ali', last_name: 'Valiev' },
});

function loginAs(roles: string[] = ['USER']) {
  mockAccessToken = 'token';
  mockUser = authedUser(roles);
}

describe('BecomeAgent', () => {
  it('(1) гость → экран входа с открытой LoginModal', () => {
    render(<BecomeAgent />);
    expect(
      screen.getByText('Войдите, чтобы подать заявку'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('login-modal')).toBeInTheDocument();
  });

  it('(2) currentUser.roles содержит AGENT → карточка «Вы уже агент»', () => {
    loginAs(['AGENT']);
    render(<BecomeAgent />);
    expect(screen.getByText('Вы уже агент Avino')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Разместить объявление' }),
    ).toHaveAttribute('href', '/sell/new');
    expect(
      screen.getByRole('link', { name: 'Мой профиль агента' }),
    ).toHaveAttribute('href', '/agents/u1');
  });

  it('(2b) currentUser.roles содержит AGENCY → тоже карточка «Вы уже агент»', () => {
    loginAs(['AGENCY']);
    render(<BecomeAgent />);
    expect(screen.getByText('Вы уже агент Avino')).toBeInTheDocument();
  });

  it('(2c) роли не агент, но заявка APPROVED (deep-link из уведомления) → тоже карточка «Вы уже агент»', () => {
    loginAs();
    mockApplication = {
      id: 'aa3',
      status: 'APPROVED',
      agencyName: null,
      about: 'about text',
      rejectReason: null,
      createdAt: '2026-07-01T10:00:00Z',
      resolvedAt: '2026-07-02T10:00:00Z',
    };
    render(<BecomeAgent />);
    expect(screen.getByText('Вы уже агент Avino')).toBeInTheDocument();
  });

  it('(3) заявка PENDING → карточка «На рассмотрении» с датой подачи', () => {
    loginAs();
    mockApplication = {
      id: 'aa1',
      status: 'PENDING',
      agencyName: null,
      about: 'about text',
      rejectReason: null,
      createdAt: '2026-07-10T10:00:00Z',
      resolvedAt: null,
    };
    render(<BecomeAgent />);
    expect(screen.getByText('Заявка на рассмотрении')).toBeInTheDocument();
    expect(screen.getByText(/10.07.2026/)).toBeInTheDocument();
  });

  it('(4) заявка REJECTED → причина отказа + префилл формы прошлыми значениями', () => {
    loginAs();
    mockApplication = {
      id: 'aa2',
      status: 'REJECTED',
      agencyName: 'Ideal Estate',
      about: 'Опытный агент',
      rejectReason: 'Недостаточно опыта',
      createdAt: '2026-07-01T10:00:00Z',
      resolvedAt: '2026-07-02T10:00:00Z',
    };
    render(<BecomeAgent />);
    expect(screen.getByText('Заявка отклонена')).toBeInTheDocument();
    expect(screen.getByText('Недостаточно опыта')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Ideal Estate')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Опытный агент')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Подать заявку повторно' }),
    ).toBeInTheDocument();
  });

  it('(5) заявок нет → форма подачи', () => {
    loginAs();
    render(<BecomeAgent />);
    expect(screen.getByText('Стать агентом Avino')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Подать заявку' }),
    ).toBeInTheDocument();
  });

  it('(5а) пустое «О себе» → инлайн-ошибка валидации, сабмит не вызывается', () => {
    loginAs();
    render(<BecomeAgent />);
    fireEvent.click(screen.getByRole('button', { name: 'Подать заявку' }));
    expect(
      screen.getByText('Расскажите о себе — это поле обязательно.'),
    ).toBeInTheDocument();
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it('успешный сабмит → вызывает мутацию с обрезанными значениями', async () => {
    loginAs();
    render(<BecomeAgent />);
    fireEvent.change(screen.getByLabelText('Агентство'), {
      target: { value: '  Ideal Estate  ' },
    });
    fireEvent.change(screen.getByLabelText('О себе'), {
      target: { value: '  10 лет на рынке  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Подать заявку' }));
    await waitFor(() =>
      expect(mockSubmit).toHaveBeenCalledWith({
        agencyName: 'Ideal Estate',
        about: '10 лет на рынке',
      }),
    );
  });

  it('409 AGENT_APPLICATION_PENDING → инлайн человекочитаемый текст', () => {
    loginAs();
    mockSubmitError = {
      status: 409,
      data: {
        error: { code: 'AGENT_APPLICATION_PENDING', message: 'pending' },
      },
    };
    render(<BecomeAgent />);
    expect(
      screen.getByText('У вас уже есть заявка на рассмотрении.'),
    ).toBeInTheDocument();
  });

  it('409 ALREADY_AGENT → инлайн человекочитаемый текст', () => {
    loginAs();
    mockSubmitError = {
      status: 409,
      data: { error: { code: 'ALREADY_AGENT', message: 'already agent' } },
    };
    render(<BecomeAgent />);
    expect(
      screen.getByText('У вас уже есть роль агента.'),
    ).toBeInTheDocument();
  });
});
