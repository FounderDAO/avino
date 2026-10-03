/**
 * GoogleSignInButton — регрессия «форма логина дёргается при вводе телефона».
 *
 * Родитель (LoginModal) передаёт `onSuccess` inline-стрелкой, т.е. новой
 * ссылкой на каждый рендер (каждый введённый символ). Кнопка GIS не должна
 * из-за этого переинициализироваться и перерисовывать свой iframe, но при
 * этом обязана вызвать актуальный `onSuccess`.
 */
import * as React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { GoogleSignInButton } from './GoogleSignInButton';

const { googleLoginSpy } = vi.hoisted(() => ({ googleLoginSpy: vi.fn() }));

vi.mock('@/store/api/authApi', () => ({
  useGoogleLoginMutation: () => [googleLoginSpy, { isLoading: false }],
}));

const initialize = vi.fn();
const renderButton = vi.fn();

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_GOOGLE_CLIENT_ID', 'test-client-id');
  window.google = { accounts: { id: { initialize, renderButton } } };
  googleLoginSpy.mockReturnValue({ unwrap: () => Promise.resolve({}) });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  delete window.google;
});

describe('GoogleSignInButton', () => {
  it('не перерисовывает кнопку GIS при ререндере родителя с новым onSuccess', () => {
    const { rerender } = render(<GoogleSignInButton onSuccess={() => {}} />);
    expect(renderButton).toHaveBeenCalledTimes(1);

    rerender(<GoogleSignInButton onSuccess={() => {}} />);
    rerender(<GoogleSignInButton onSuccess={() => {}} />);

    expect(initialize).toHaveBeenCalledTimes(1);
    expect(renderButton).toHaveBeenCalledTimes(1);
  });

  it('после ререндера вызывает актуальный onSuccess', async () => {
    const first = vi.fn();
    const latest = vi.fn();
    const { rerender } = render(<GoogleSignInButton onSuccess={first} />);
    rerender(<GoogleSignInButton onSuccess={latest} />);

    const { callback } = initialize.mock.calls[0][0] as {
      callback: (resp: { credential: string }) => void;
    };
    callback({ credential: 'id-token' });

    await waitFor(() => expect(latest).toHaveBeenCalledTimes(1));
    expect(first).not.toHaveBeenCalled();
    expect(googleLoginSpy).toHaveBeenCalledWith({ id_token: 'id-token' });
  });
});
