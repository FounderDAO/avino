import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ContactDetailsGate } from './ContactDetailsGate';

const updateProfile = vi.fn();
let mockUser: unknown = null;

vi.mock('next-intl', () => ({
  useTranslations: () => {
    const t = (key: string) => key;
    // t.rich нужен для noPhoneHint: рендерим текст ключа, chunks-функцию игнорим.
    t.rich = (key: string) => key;
    return t;
  },
}));
vi.mock('@/i18n/navigation', () => ({
  Link: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('@/store/hooks', () => ({
  useAppSelector: (sel: unknown) =>
    (sel as (s: unknown) => unknown)({
      auth: { user: mockUser, status: 'authenticated' },
    }),
}));
vi.mock('@/store/api/usersApi', () => ({
  useUpdateProfileMutation: () => [updateProfile, { isLoading: false }],
}));

describe('ContactDetailsGate', () => {
  beforeEach(() => {
    updateProfile.mockReset();
    updateProfile.mockReturnValue({ unwrap: () => Promise.resolve({}) });
  });

  it('предзаполняет имя из профиля и показывает телефон логина (read-only)', () => {
    mockUser = {
      phone: '+998901234567',
      profile: { first_name: 'Ali', last_name: null, contact_phone: null },
    };
    render(<ContactDetailsGate />);
    expect(screen.getByLabelText('contactGate.firstName')).toHaveValue('Ali');
    const phone = screen.getByLabelText('contactGate.phone');
    expect(phone).toHaveValue('+998 90 123 45 67');
    expect(phone).toBeDisabled();
  });

  it('submit заблокирован, пока не заполнены имя и фамилия', () => {
    mockUser = {
      phone: '+998901234567',
      profile: { first_name: null, last_name: null, contact_phone: null },
    };
    render(<ContactDetailsGate />);
    expect(
      screen.getByRole('button', { name: 'contactGate.submit' }),
    ).toBeDisabled();
    fireEvent.change(screen.getByLabelText('contactGate.firstName'), {
      target: { value: 'Ali' },
    });
    fireEvent.change(screen.getByLabelText('contactGate.lastName'), {
      target: { value: 'Valiev' },
    });
    expect(
      screen.getByRole('button', { name: 'contactGate.submit' }),
    ).toBeEnabled();
  });

  it('шлёт PATCH только с first_name/last_name (без contact_phone, trim)', async () => {
    mockUser = {
      phone: '+998901234567',
      profile: { first_name: null, last_name: null, contact_phone: null },
    };
    render(<ContactDetailsGate />);
    fireEvent.change(screen.getByLabelText('contactGate.firstName'), {
      target: { value: ' Ali ' },
    });
    fireEvent.change(screen.getByLabelText('contactGate.lastName'), {
      target: { value: 'Valiev' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'contactGate.submit' }));
    await waitFor(() =>
      expect(updateProfile).toHaveBeenCalledWith({
        first_name: 'Ali',
        last_name: 'Valiev',
      }),
    );
    const payload = updateProfile.mock.calls[0][0];
    expect(payload).not.toHaveProperty('contact_phone');
  });

  it('использует contact_phone профиля как публичный контакт, если он задан', () => {
    mockUser = {
      phone: '+998900000000',
      profile: {
        first_name: 'Ali',
        last_name: 'Valiev',
        contact_phone: '+998901234567',
      },
    };
    render(<ContactDetailsGate />);
    expect(screen.getByLabelText('contactGate.phone')).toHaveValue(
      '+998 90 123 45 67',
    );
  });

  it('без телефона (Google/Apple) блокирует submit и показывает подсказку', () => {
    mockUser = {
      phone: null,
      profile: { first_name: 'Ali', last_name: 'Valiev', contact_phone: null },
    };
    render(<ContactDetailsGate />);
    expect(
      screen.getByRole('button', { name: 'contactGate.submit' }),
    ).toBeDisabled();
    expect(screen.getByText('contactGate.noPhoneHint')).toBeInTheDocument();
  });

  it('пересинхронизирует имя/фамилию при догрузке user (getMe асинхронен)', () => {
    mockUser = null;
    const { rerender } = render(<ContactDetailsGate />);

    mockUser = {
      phone: '+998901234567',
      profile: { first_name: 'Ali', last_name: 'Valiev', contact_phone: null },
    };
    rerender(<ContactDetailsGate />);

    expect(screen.getByLabelText('contactGate.firstName')).toHaveValue('Ali');
    expect(screen.getByLabelText('contactGate.lastName')).toHaveValue('Valiev');
  });

  it('показывает текст ошибки, если PATCH реджектится', async () => {
    mockUser = {
      phone: '+998901234567',
      profile: { first_name: 'Ali', last_name: 'Valiev', contact_phone: null },
    };
    updateProfile.mockReturnValue({
      unwrap: () =>
        Promise.reject({
          status: 500,
          data: { error: { code: 'INTERNAL', message: 'boom' } },
        }),
    });
    render(<ContactDetailsGate />);
    fireEvent.click(screen.getByRole('button', { name: 'contactGate.submit' }));
    await waitFor(() => expect(screen.getByText('boom')).toBeInTheDocument());
  });
});
