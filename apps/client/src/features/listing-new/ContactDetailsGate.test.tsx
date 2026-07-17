import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ContactDetailsGate } from './ContactDetailsGate';

const updateProfile = vi.fn();
let mockUser: unknown = null;

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock('@/store/hooks', () => ({
  useAppSelector: (sel: unknown) =>
    (sel as (s: unknown) => unknown)({ auth: { user: mockUser, status: 'authenticated' } }),
}));
vi.mock('@/store/api/usersApi', () => ({
  useUpdateProfileMutation: () => [updateProfile, { isLoading: false }],
}));

describe('ContactDetailsGate', () => {
  beforeEach(() => {
    updateProfile.mockReset();
    updateProfile.mockReturnValue({ unwrap: () => Promise.resolve({}) });
  });

  it('предзаполняет поля из профиля и телефона аккаунта', () => {
    mockUser = {
      phone: '+998901234567',
      profile: { first_name: 'Ali', last_name: null, contact_phone: null },
    };
    render(<ContactDetailsGate />);
    expect(screen.getByLabelText('contactGate.firstName')).toHaveValue('Ali');
    expect(screen.getByLabelText('contactGate.phone')).toHaveValue('+998 90 123 45 67');
  });

  it('submit заблокирован, пока не заполнены все три поля', () => {
    mockUser = { phone: null, profile: { first_name: null, last_name: null, contact_phone: null } };
    render(<ContactDetailsGate />);
    expect(screen.getByRole('button', { name: 'contactGate.submit' })).toBeDisabled();
  });

  it('шлёт PATCH с first_name/last_name/contact_phone (trim)', async () => {
    mockUser = { phone: null, profile: { first_name: null, last_name: null, contact_phone: null } };
    render(<ContactDetailsGate />);
    fireEvent.change(screen.getByLabelText('contactGate.firstName'), { target: { value: ' Ali ' } });
    fireEvent.change(screen.getByLabelText('contactGate.lastName'), { target: { value: 'Valiev' } });
    fireEvent.change(screen.getByLabelText('contactGate.phone'), { target: { value: '+998901234567' } });
    fireEvent.click(screen.getByRole('button', { name: 'contactGate.submit' }));
    await waitFor(() =>
      expect(updateProfile).toHaveBeenCalledWith({
        first_name: 'Ali',
        last_name: 'Valiev',
        contact_phone: '+998901234567',
      }),
    );
  });

  it('пересинхронизирует поля при догрузке user (getMe асинхронен)', () => {
    mockUser = null;
    const { rerender } = render(<ContactDetailsGate />);

    mockUser = {
      phone: null,
      profile: { first_name: 'Ali', last_name: 'Valiev', contact_phone: '+998901234567' },
    };
    rerender(<ContactDetailsGate />);

    expect(screen.getByLabelText('contactGate.firstName')).toHaveValue('Ali');
    expect(screen.getByLabelText('contactGate.lastName')).toHaveValue('Valiev');
    expect(screen.getByLabelText('contactGate.phone')).toHaveValue('+998 90 123 45 67');
  });

  it('показывает текст ошибки, если PATCH реджектится', async () => {
    mockUser = {
      phone: '+998901234567',
      profile: { first_name: 'Ali', last_name: 'Valiev', contact_phone: null },
    };
    updateProfile.mockReturnValue({
      unwrap: () =>
        Promise.reject({ status: 500, data: { error: { code: 'INTERNAL', message: 'boom' } } }),
    });
    render(<ContactDetailsGate />);
    fireEvent.click(screen.getByRole('button', { name: 'contactGate.submit' }));
    await waitFor(() => expect(screen.getByText('boom')).toBeInTheDocument());
  });
});
