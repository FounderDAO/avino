import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ru from '../../../messages/ru.json';

const CURRENT = {
  id: 'fid-current',
  created_at: '2026-07-01T10:00:00.000Z',
  last_rotated_at: '2026-07-12T08:30:00.000Z',
  user_agent:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  ip: '203.0.113.7',
  is_current: true,
};
const OTHER = {
  id: 'fid-other',
  created_at: '2026-07-10T12:00:00.000Z',
  last_rotated_at: '2026-07-10T12:00:00.000Z',
  user_agent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  ip: '198.51.100.3',
  is_current: false,
};

const refetch = vi.fn();
// unwrap-результат управляется из тестов (успех / 404 / прочая ошибка).
const revokeState: { result: () => Promise<unknown> } = {
  result: () => Promise.resolve({}),
};
const revokeSpy = vi.fn(() => ({ unwrap: revokeState.result }));
const toastSpies = vi.hoisted(() => ({
  success: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
}));

vi.mock('@/store/hooks', () => ({ useAppSelector: () => true }));
vi.mock('@/store/api/sessionsApi', () => ({
  useGetSessionsQuery: () => ({
    data: [OTHER, CURRENT],
    isLoading: false,
    refetch,
  }),
  useRevokeSessionMutation: () => [revokeSpy],
}));
vi.mock('@/i18n/navigation', () => ({
  Link: (p: any) => <a href={p.href}>{p.children}</a>,
}));
vi.mock('sonner', () => ({ toast: toastSpies }));
vi.mock('next-intl', () => ({
  useTranslations: (ns: string) => (k: string) =>
    k.split('.').reduce((o: any, p) => o?.[p], (ru as any)[ns]) ?? k,
  useFormatter: () => ({ dateTime: (d: Date) => d.toISOString() }),
}));

import { Devices } from './Devices';

describe('Devices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    revokeState.result = () => Promise.resolve({});
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('рендерит обе сессии: устройства из UA, IP, бейдж только у текущей', () => {
    render(<Devices />);
    expect(screen.getByText('Chrome · macOS')).toBeInTheDocument();
    expect(screen.getByText('Safari · iOS')).toBeInTheDocument();
    expect(screen.getByText(/203\.0\.113\.7/)).toBeInTheDocument();
    expect(screen.getAllByText(ru.account.devices.current)).toHaveLength(1);
  });

  it('текущая сессия отсортирована первой и без кнопки «Завершить»', () => {
    render(<Devices />);
    const labels = screen
      .getAllByText(/·/)
      .map((el) => el.textContent)
      .filter((tx) => tx === 'Chrome · macOS' || tx === 'Safari · iOS');
    expect(labels[0]).toBe('Chrome · macOS'); // is_current первым, хотя в data вторым
    expect(screen.getAllByText(ru.account.devices.revoke)).toHaveLength(1);
  });

  it('confirm → DELETE → success-toast', async () => {
    render(<Devices />);
    fireEvent.click(screen.getByText(ru.account.devices.revoke));
    expect(window.confirm).toHaveBeenCalledWith(ru.account.devices.confirmRevoke);
    expect(revokeSpy).toHaveBeenCalledWith('fid-other');
    await waitFor(() =>
      expect(toastSpies.success).toHaveBeenCalledWith(ru.account.devices.revoked),
    );
  });

  it('отмена confirm — мутация не вызывается', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<Devices />);
    fireEvent.click(screen.getByText(ru.account.devices.revoke));
    expect(revokeSpy).not.toHaveBeenCalled();
  });

  it('404 — «уже завершена» + refetch, не error-toast', async () => {
    revokeState.result = () => Promise.reject({ status: 404 });
    render(<Devices />);
    fireEvent.click(screen.getByText(ru.account.devices.revoke));
    await waitFor(() =>
      expect(toastSpies.info).toHaveBeenCalledWith(
        ru.account.devices.alreadyRevoked,
      ),
    );
    expect(refetch).toHaveBeenCalled();
    expect(toastSpies.error).not.toHaveBeenCalled();
  });

  it('прочая ошибка — error-toast с message из envelope', async () => {
    revokeState.result = () =>
      Promise.reject({
        status: 500,
        data: { error: { code: 'INTERNAL', message: 'Внутренняя ошибка' } },
      });
    render(<Devices />);
    fireEvent.click(screen.getByText(ru.account.devices.revoke));
    await waitFor(() =>
      expect(toastSpies.error).toHaveBeenCalledWith('Внутренняя ошибка'),
    );
    expect(refetch).not.toHaveBeenCalled();
  });
});
