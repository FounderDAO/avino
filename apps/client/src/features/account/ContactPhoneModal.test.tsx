import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ru from '../../../messages/ru.json';

const requestState: { result: () => Promise<unknown> } = {
  result: () => Promise.resolve({ applied: true }),
};
const verifyState: { result: () => Promise<unknown> } = {
  result: () => Promise.resolve({}),
};
const requestSpy = vi.fn(() => ({ unwrap: requestState.result }));
const verifySpy = vi.fn(() => ({ unwrap: verifyState.result }));

vi.mock('@/store/api/usersApi', () => ({
  useRequestContactPhoneChangeMutation: () => [requestSpy, { isLoading: false }],
  useVerifyContactPhoneChangeMutation: () => [verifySpy, { isLoading: false }],
}));
vi.mock('next-intl', () => ({
  useTranslations: (ns: string) => (k: string) =>
    k.split('.').reduce((o: any, p) => o?.[p], (ru as any)[ns]) ?? k,
}));

import { ContactPhoneModal } from './ContactPhoneModal';

describe('ContactPhoneModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requestState.result = () => Promise.resolve({ applied: true });
    verifyState.result = () => Promise.resolve({});
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('applied:true — успех сразу, шаг кода не показывается', async () => {
    const onSuccess = vi.fn();
    render(<ContactPhoneModal open onClose={vi.fn()} onSuccess={onSuccess} />);

    expect(screen.getByText(ru.account.contactPhone.modalTitle)).toBeInTheDocument();

    const input = screen.getByPlaceholderText('+998 90 123 45 67');
    fireEvent.change(input, { target: { value: '901234567' } });

    await act(async () => {
      fireEvent.click(screen.getByText(ru.account.contactChange.sendCode));
    });

    expect(requestSpy).toHaveBeenCalledWith({ destination: '+998901234567' });
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(screen.queryByLabelText(ru.account.contactChange.codeLabel)).not.toBeInTheDocument();
  });

  it('applied:false — показывается шаг кода, verify → onSuccess', async () => {
    requestState.result = () =>
      Promise.resolve({
        applied: false,
        request_id: 'r-1',
        channel: 'SMS',
        expires_in: 300,
        resend_after: 60,
      });
    const onSuccess = vi.fn();
    render(<ContactPhoneModal open onClose={vi.fn()} onSuccess={onSuccess} />);

    const input = screen.getByPlaceholderText('+998 90 123 45 67');
    fireEvent.change(input, { target: { value: '901234567' } });

    await act(async () => {
      fireEvent.click(screen.getByText(ru.account.contactChange.sendCode));
    });

    expect(requestSpy).toHaveBeenCalledWith({ destination: '+998901234567' });
    const codeInput = await screen.findByLabelText(ru.account.contactChange.codeLabel);

    fireEvent.change(codeInput, { target: { value: '123456' } });
    await act(async () => {
      fireEvent.click(screen.getByText(ru.account.contactChange.confirm));
    });

    expect(verifySpy).toHaveBeenCalledWith({ destination: '+998901234567', code: '123456' });
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
  });

  it('OTP_INVALID — инлайн-ошибка errCode', async () => {
    requestState.result = () =>
      Promise.resolve({
        applied: false,
        request_id: 'r-1',
        channel: 'SMS',
        expires_in: 300,
        resend_after: 60,
      });
    render(<ContactPhoneModal open onClose={vi.fn()} onSuccess={vi.fn()} />);

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

    expect(await screen.findByText(ru.account.contactChange.errCode)).toBeInTheDocument();
  });

  it('open=false — ничего не рендерит', () => {
    render(<ContactPhoneModal open={false} onClose={vi.fn()} onSuccess={vi.fn()} />);
    expect(screen.queryByText(ru.account.contactPhone.modalTitle)).not.toBeInTheDocument();
  });
});
