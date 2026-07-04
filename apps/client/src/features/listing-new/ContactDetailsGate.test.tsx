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
    expect(screen.getByLabelText('contactGate.phone')).toHaveValue('+998901234567');
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
});
