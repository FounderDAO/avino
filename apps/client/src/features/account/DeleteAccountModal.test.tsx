import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ru from '../../../messages/ru.json';

const deleteState: { result: () => Promise<unknown> } = { result: () => Promise.resolve() };
const deleteSpy = vi.fn(() => ({ unwrap: deleteState.result }));
const pushSpy = vi.fn();
const dispatchSpy = vi.fn();

vi.mock('@/store/api/usersApi', () => ({
  useDeleteAccountMutation: () => [deleteSpy, { isLoading: false }],
}));
vi.mock('@/i18n/navigation', () => ({ useRouter: () => ({ push: pushSpy }) }));
vi.mock('@/store/hooks', () => ({ useAppDispatch: () => dispatchSpy }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('next-intl', () => ({
  useTranslations: (ns: string) => (k: string) =>
    k.split('.').reduce((o: any, p) => o?.[p], (ru as any)[ns]) ?? k,
}));

import { DeleteAccountModal } from './DeleteAccountModal';

describe('DeleteAccountModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deleteState.result = () => Promise.resolve();
  });

  it('кнопка удаления заблокирована, пока не введено точное слово', () => {
    render(<DeleteAccountModal open onClose={vi.fn()} />);
    const confirmBtn = screen.getByText(ru.account.deleteAccount.confirmButton);
    expect(confirmBtn).toBeDisabled();
    const input = screen.getByPlaceholderText(ru.account.deleteAccount.confirmPlaceholder);
    fireEvent.change(input, { target: { value: 'удалить' } }); // регистронезависимо → активна
    expect(confirmBtn).not.toBeDisabled();
  });

  it('успех: вызывает мутацию, чистит креды, редиректит', async () => {
    render(<DeleteAccountModal open onClose={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(ru.account.deleteAccount.confirmPlaceholder), {
      target: { value: 'УДАЛИТЬ' },
    });
    await act(async () => {
      fireEvent.click(screen.getByText(ru.account.deleteAccount.confirmButton));
    });
    expect(deleteSpy).toHaveBeenCalled();
    await waitFor(() => expect(dispatchSpy).toHaveBeenCalled());
    expect(pushSpy).toHaveBeenCalledWith('/');
  });
});
