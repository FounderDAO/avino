/**
 * LoginModal — регрессионный тест выбора канала входа (PRD §auth: phone/email).
 *
 * Проверяет, что переключатель «Телефон / Email» действительно меняет канал OTP:
 * по умолчанию шаги request/verify уходят с `channel: 'SMS'`, а после выбора
 * Email — с `channel: 'EMAIL'` и введённым email-адресом; успешный verify
 * закрывает модалку. Слой authApi (RTK Query) замокан — тестируем именно
 * проводку компонента, а не сеть (живой EMAIL-OTP проверен отдельно на бэкенде).
 */
import * as React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoginModal } from './LoginModal';

// Спаи триггеров мутаций — нужны и в hoisted-моке, и в ассертах.
const { requestSpy, verifySpy } = vi.hoisted(() => ({
  requestSpy: vi.fn(),
  verifySpy: vi.fn(),
}));

// next-intl's real runtime тянет next/navigation (не резолвится в vitest).
// Мокаем useTranslations резолвером по настоящему messages/ru.json — тест
// проверяет реальные строки UI без Next-рантайма.
vi.mock('next-intl', async () => {
  const ru = (await import('../../../messages/ru.json')).default as Record<
    string,
    unknown
  >;
  const useTranslations =
    (ns: string) =>
    (key: string, vars?: Record<string, unknown>): string => {
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
      if (typeof val !== 'string') return key;
      return vars
        ? val.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''))
        : val;
    };
  return { useTranslations };
});

// `@/i18n/navigation` строит Link через next-intl/navigation → next/navigation.
vi.mock('@/i18n/navigation', () => ({
  Link: ({ children, ...props }: { children?: React.ReactNode }) => (
    <a {...props}>{children}</a>
  ),
}));

vi.mock('next/image', () => ({
  // eslint-disable-next-line @next/next/no-img-element -- тестовая заглушка
  default: ({ alt }: { alt?: string }) => <img alt={alt ?? ''} />,
}));

// authApi — мокаем хуки мутаций: триггер возвращает объект с `.unwrap()`.
const idleState = { isLoading: false, error: undefined, reset: vi.fn() };
vi.mock('@/store/api/authApi', () => ({
  useRequestOtpMutation: () => [requestSpy, idleState],
  useVerifyOtpMutation: () => [verifySpy, idleState],
  // GoogleSignInButton дёргает этот хук при рендере (вернёт null без client_id).
  useGoogleLoginMutation: () => [vi.fn(), idleState],
}));

describe('LoginModal — выбор канала входа', () => {
  beforeEach(() => {
    requestSpy.mockReturnValue({
      unwrap: () =>
        Promise.resolve({
          request_id: 'req_1',
          channel: 'SMS',
          expires_in: 300,
          resend_after: 60,
        }),
    });
    verifySpy.mockReturnValue({
      unwrap: () =>
        Promise.resolve({
          access_token: 'access',
          refresh_token: 'refresh',
          token_type: 'Bearer',
          expires_in: 900,
          user: {
            id: 'u1',
            phone: null,
            email: 'buyer@example.com',
            default_language: 'RU',
            status: 'ACTIVE',
            roles: ['USER'],
            is_phone_verified: false,
            is_email_verified: true,
          },
        }),
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('по умолчанию использует телефон (SMS)', async () => {
    const user = userEvent.setup();
    render(<LoginModal open onOpenChange={vi.fn()} />);

    await user.type(
      screen.getByPlaceholderText('+998 90 123 45 67'),
      '901234567',
    );
    await user.click(screen.getByRole('button', { name: 'Получить код' }));

    await waitFor(() =>
      expect(requestSpy).toHaveBeenCalledWith({
        channel: 'SMS',
        destination: '+998901234567',
      }),
    );
  });

  it('переключение на Email шлёт channel EMAIL на request и verify, затем закрывает модалку', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<LoginModal open onOpenChange={onOpenChange} />);

    // Переключаемся на вкладку Email и вводим адрес.
    await user.click(screen.getByRole('tab', { name: 'Email' }));
    await user.type(
      screen.getByPlaceholderText('you@example.com'),
      'buyer@example.com',
    );
    await user.click(screen.getByRole('button', { name: 'Получить код' }));

    // Шаг 1 → request ушёл с EMAIL-каналом и введённым адресом.
    await waitFor(() =>
      expect(requestSpy).toHaveBeenCalledWith({
        channel: 'EMAIL',
        destination: 'buyer@example.com',
      }),
    );

    // Перешли на шаг кода — вводим 6-значный код и подтверждаем.
    const codeInput = await screen.findByPlaceholderText('••••');
    await user.type(codeInput, '123456');
    await user.click(screen.getByRole('button', { name: 'Подтвердить' }));

    // Шаг 2 → verify ушёл с тем же EMAIL-каналом, адресом и кодом.
    await waitFor(() =>
      expect(verifySpy).toHaveBeenCalledWith({
        channel: 'EMAIL',
        destination: 'buyer@example.com',
        code: '123456',
      }),
    );

    // Успешный вход закрывает модалку.
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });
});
