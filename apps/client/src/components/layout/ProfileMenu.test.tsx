/**
 * ProfileMenu — профиль-меню в шапке (стиль OLX).
 * Слои Redux / RTK Query / i18n-навигация замоканы — проверяем проводку и
 * приватность (имя не светится), а не сеть. next-intl резолвится по реальному
 * messages/ru.json (как в ContactCard.test).
 */
import * as React from 'react';
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { pushSpy, logoutSpy } = vi.hoisted(() => ({
  pushSpy: vi.fn(),
  logoutSpy: vi.fn(() => Promise.resolve(undefined)),
}));

// Управляемое состояние стора для useAppSelector(<реальный селектор>).
let mockState: {
  auth: {
    accessToken: string | null;
    refreshToken: string | null;
    user: {
      email: string | null;
      phone: string | null;
      profile: {
        avatar_url: string | null;
        first_name?: string | null;
        last_name?: string | null;
        display_name?: string | null;
      };
    } | null;
  };
};

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
  useRouter: () => ({ push: pushSpy }),
}));

// useAppSelector прогоняем через реальные селекторы по mockState.
vi.mock('@/store/hooks', () => ({
  useAppSelector: (sel: (s: unknown) => unknown) => sel(mockState),
}));

vi.mock('@/store/favorites', () => ({
  useFavoritesCount: () => 3,
}));

vi.mock('@/store/api/savedSearchesApi', () => ({
  useGetSavedSearchesQuery: () => ({ data: [{ id: 'a' }, { id: 'b' }] }),
}));

vi.mock('@/store/api/authApi', () => ({
  useLogoutMutation: () => [logoutSpy, { isLoading: false }],
}));

import { ProfileMenu } from './ProfileMenu';

beforeAll(() => {
  if (!Element.prototype.hasPointerCapture)
    Element.prototype.hasPointerCapture = () => false;
  if (!Element.prototype.releasePointerCapture)
    Element.prototype.releasePointerCapture = () => {};
  if (!Element.prototype.scrollIntoView)
    Element.prototype.scrollIntoView = () => {};
});

beforeEach(() => {
  mockState = {
    auth: {
      accessToken: 'access',
      refreshToken: 'refresh',
      user: {
        email: 'taplinksuz@gmail.com',
        phone: '+998901112233',
        // Имя ЕСТЬ в данных, но НЕ должно попасть в UI (приватность).
        profile: {
          avatar_url: null,
          first_name: 'Камила',
          last_name: 'Назарова',
          display_name: 'Камила Назарова',
        },
      },
    },
  };
});

afterEach(() => vi.clearAllMocks());

describe('ProfileMenu', () => {
  it('триггер показывает «Ваш профиль» и НЕ показывает имя', () => {
    render(<ProfileMenu />);
    expect(
      screen.getByRole('button', { name: /Ваш профиль/ }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Камила/)).not.toBeInTheDocument();
  });

  it('по клику открывает все пункты назначения и счётчики', async () => {
    const user = userEvent.setup();
    render(<ProfileMenu />);
    await user.click(screen.getByRole('button', { name: /Ваш профиль/ }));

    expect(screen.getByText('Профиль')).toBeInTheDocument();
    expect(screen.getByText('Чат')).toBeInTheDocument();
    expect(screen.getByText('Настройки')).toBeInTheDocument();
    expect(screen.getByText('Поиски')).toBeInTheDocument();
    expect(screen.getByText('Выйти')).toBeInTheDocument();
    // «Объявления» встречается дважды (пункт + избранное).
    expect(screen.getAllByText('Объявления')).toHaveLength(2);
    // Счётчики из моков: избранное 3, поиски 2.
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    // Имя из данных не должно появиться даже в открытой панели.
    expect(screen.queryByText(/Камила/)).not.toBeInTheDocument();
  });

  it('в шапке панели показывает email-локалpart, а не имя', async () => {
    const user = userEvent.setup();
    render(<ProfileMenu />);
    await user.click(screen.getByRole('button', { name: /Ваш профиль/ }));
    expect(screen.getByText('taplinksuz')).toBeInTheDocument();
  });

  it('клик по «Чат» ведёт на /account/inbox', async () => {
    const user = userEvent.setup();
    render(<ProfileMenu />);
    await user.click(screen.getByRole('button', { name: /Ваш профиль/ }));
    await user.click(screen.getByText('Чат'));
    expect(pushSpy).toHaveBeenCalledWith('/account/inbox');
  });

  it('клик по «Выйти» отзывает refresh-токен и уводит на /', async () => {
    const user = userEvent.setup();
    render(<ProfileMenu />);
    await user.click(screen.getByRole('button', { name: /Ваш профиль/ }));
    await user.click(screen.getByText('Выйти'));
    expect(logoutSpy).toHaveBeenCalledWith({ refresh_token: 'refresh' });
    await waitFor(() => expect(pushSpy).toHaveBeenCalledWith('/'));
  });

  it('без email и телефона показывает запасной «Аккаунт»', async () => {
    mockState.auth.user!.email = null;
    mockState.auth.user!.phone = null;
    const user = userEvent.setup();
    render(<ProfileMenu />);
    await user.click(screen.getByRole('button', { name: /Ваш профиль/ }));
    expect(screen.getByText('Аккаунт')).toBeInTheDocument();
  });
});
