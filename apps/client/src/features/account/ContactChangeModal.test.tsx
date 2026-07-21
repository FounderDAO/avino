import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ru from '../../../messages/ru.json';

const requestState: { result: () => Promise<unknown> } = {
  result: () => Promise.resolve({ request_id: 'r-1', channel: 'SMS', expires_in: 300, resend_after: 60 }),
};
const verifyState: { result: () => Promise<unknown> } = {
  result: () => Promise.resolve({}),
};
const requestSpy = vi.fn(() => ({ unwrap: requestState.result }));
const verifySpy = vi.fn(() => ({ unwrap: verifyState.result }));

vi.mock('@/store/api/usersApi', () => ({
  useRequestContactChangeMutation: () => [requestSpy, { isLoading: false }],
  useVerifyContactChangeMutation: () => [verifySpy, { isLoading: false }],
}));
vi.mock('next-intl', () => ({
  useTranslations: (ns: string) => (k: string) =>
    k.split('.').reduce((o: any, p) => o?.[p], (ru as any)[ns]) ?? k,
}));

import { ContactChangeModal } from './ContactChangeModal';

describe('ContactChangeModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requestState.result = () =>
      Promise.resolve({ request_id: 'r-1', channel: 'SMS', expires_in: 300, resend_after: 60 });
    verifyState.result = () => Promise.resolve({});
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('happy path (SMS): ввод номера → код → подтверждение → onSuccess', async () => {
    const onSuccess = vi.fn();
    const onClose = vi.fn();
    render(
      <ContactChangeModal channel="SMS" open onClose={onClose} onSuccess={onSuccess} />,
    );

    expect(screen.getByText(ru.account.contactChange.titlePhone)).toBeInTheDocument();

    const input = screen.getByPlaceholderText('+998 90 123 45 67');
    fireEvent.change(input, { target: { value: '901234567' } });

    await act(async () => {
      fireEvent.click(screen.getByText(ru.account.contactChange.sendCode));
    });

    expect(requestSpy).toHaveBeenCalledWith({ channel: 'SMS', destination: '+998901234567' });
    expect(await screen.findByText(ru.account.contactChange.codeLabel)).toBeInTheDocument();

    const codeInput = screen.getByLabelText(ru.account.contactChange.codeLabel);
    fireEvent.change(codeInput, { target: { value: '123456' } });

    await act(async () => {
      fireEvent.click(screen.getByText(ru.account.contactChange.confirm));
    });

    expect(verifySpy).toHaveBeenCalledWith({
      channel: 'SMS',
      destination: '+998901234567',
      code: '123456',
    });
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
  });

  it('шаг 1: CONTACT_TAKEN — инлайн-ошибка, шаг не переключается', async () => {
    requestState.result = () =>
      Promise.reject({ data: { error: { code: 'CONTACT_TAKEN', message: 'taken' } } });
    render(<ContactChangeModal channel="SMS" open onClose={vi.fn()} onSuccess={vi.fn()} />);

    const input = screen.getByPlaceholderText('+998 90 123 45 67');
    fireEvent.change(input, { target: { value: '901234567' } });
    await act(async () => {
      fireEvent.click(screen.getByText(ru.account.contactChange.sendCode));
    });

    expect(
      await screen.findByText(ru.account.contactChange.errTaken),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(ru.account.contactChange.codeLabel)).not.toBeInTheDocument();
  });

  it('шаг 2: OTP_INVALID/OTP_EXPIRED/OTP_ATTEMPTS_EXCEEDED — инлайн-ошибка', async () => {
    render(<ContactChangeModal channel="SMS" open onClose={vi.fn()} onSuccess={vi.fn()} />);

    const input = screen.getByPlaceholderText('+998 90 123 45 67');
    fireEvent.change(input, { target: { value: '901234567' } });
    await act(async () => {
      fireEvent.click(screen.getByText(ru.account.contactChange.sendCode));
    });
    const codeInput = await screen.findByLabelText(ru.account.contactChange.codeLabel);

    verifyState.result = () =>
      Promise.reject({ data: { error: { code: 'OTP_INVALID', message: 'bad' } } });
    fireEvent.change(codeInput, { target: { value: '000000' } });
    await act(async () => {
      fireEvent.click(screen.getByText(ru.account.contactChange.confirm));
    });
    expect(
      await screen.findByText(ru.account.contactChange.errCode),
    ).toBeInTheDocument();

    verifyState.result = () =>
      Promise.reject({ data: { error: { code: 'OTP_EXPIRED', message: 'exp' } } });
    await act(async () => {
      fireEvent.click(screen.getByText(ru.account.contactChange.confirm));
    });
    expect(
      await screen.findByText(ru.account.contactChange.errExpired),
    ).toBeInTheDocument();

    verifyState.result = () =>
      Promise.reject({ data: { error: { code: 'OTP_ATTEMPTS_EXCEEDED', message: 'many' } } });
    await act(async () => {
      fireEvent.click(screen.getByText(ru.account.contactChange.confirm));
    });
    expect(
      await screen.findByText(ru.account.contactChange.errAttempts),
    ).toBeInTheDocument();
  });

  it('таймер повтора: кнопка «Отправить снова» дизейблится до истечения resend_after', async () => {
    render(<ContactChangeModal channel="EMAIL" open onClose={vi.fn()} onSuccess={vi.fn()} />);

    const input = screen.getByPlaceholderText(/mail/i);
    fireEvent.change(input, { target: { value: 'new@example.com' } });
    await act(async () => {
      fireEvent.click(screen.getByText(ru.account.contactChange.sendCode));
    });
    await screen.findByLabelText(ru.account.contactChange.codeLabel);

    // Мок next-intl не подставляет ICU-параметры — сверяем «сырой» шаблон
    // (реальный next-intl в проде подставит число секунд вместо {seconds}).
    const resendBtn = screen.getByRole('button', {
      name: ru.account.contactChange.resendIn,
    });
    expect(resendBtn).toBeDisabled();

    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    expect(
      screen.getByRole('button', { name: ru.account.contactChange.resend }),
    ).not.toBeDisabled();
  });

  it('channel=EMAIL: заголовок и обычное текстовое поле (не PhoneField)', () => {
    render(<ContactChangeModal channel="EMAIL" open onClose={vi.fn()} onSuccess={vi.fn()} />);
    expect(screen.getByText(ru.account.contactChange.titleEmail)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('+998 90 123 45 67')).not.toBeInTheDocument();
  });

  it('open=false — ничего не рендерит', () => {
    render(<ContactChangeModal channel="SMS" open={false} onClose={vi.fn()} onSuccess={vi.fn()} />);
    expect(screen.queryByText(ru.account.contactChange.titlePhone)).not.toBeInTheDocument();
  });
});
