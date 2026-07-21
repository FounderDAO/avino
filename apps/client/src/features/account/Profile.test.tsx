import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ru from '../../../messages/ru.json';

/**
 * Profile — блок «Аккаунт (вход)» (Task 8, docs/superpowers/plans/2026-07-21-contact-change-otp.md).
 * ContactChangeModal мокается стаб-компонентом, чтобы проверить только то,
 * что относится к Profile: какие данные показаны, с каким channel модалка
 * открывается и что onSuccess тостит и закрывает её. Сама модалка (её OTP-шаги,
 * ошибки, таймер) покрыта отдельно в ContactChangeModal.test.tsx.
 */

const MOCK_USER = {
  id: 'u1',
  phone: '+998901234567',
  email: 'user@example.com',
  status: 'ACTIVE' as const,
  default_language: 'RU' as const,
  is_phone_verified: true,
  is_email_verified: false,
  roles: ['USER'] as const,
  profile: {
    first_name: 'Ivan',
    last_name: 'Petrov',
    display_name: null,
    avatar_url: null,
    contact_phone: '+998901234567',
    preferred_language: 'RU' as const,
  },
  legal_consent: { accepted_version: 1, accepted_at: '2026-01-01T00:00:00.000Z' },
};

let mockUser: typeof MOCK_USER | null = MOCK_USER;
let mockIsAuthed = true;

const updateProfileSpy = vi.fn(() => ({ unwrap: () => Promise.resolve({}) }));
const uploadAvatarSpy = vi.fn(() => ({ unwrap: () => Promise.resolve({}) }));
const deleteAvatarSpy = vi.fn(() => ({ unwrap: () => Promise.resolve({}) }));

vi.mock('@/store/hooks', () => ({
  useAppSelector: (selector: (s: unknown) => unknown) =>
    selector({ auth: { user: mockUser, accessToken: mockIsAuthed ? 't' : null, refreshToken: null } }),
}));
vi.mock('@/store/api/usersApi', () => ({
  useUpdateProfileMutation: () => [updateProfileSpy, { isLoading: false }],
  useUploadAvatarMutation: () => [uploadAvatarSpy, { isLoading: false }],
  useDeleteAvatarMutation: () => [deleteAvatarSpy, { isLoading: false }],
}));
vi.mock('@/i18n/navigation', () => ({ Link: (p: any) => <a href={p.href}>{p.children}</a> }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('next-intl', () => ({
  useTranslations: (ns: string) => (k: string) =>
    k.split('.').reduce((o: any, p) => o?.[p], (ru as any)[ns]) ?? k,
}));
vi.mock('./ContactChangeModal', () => ({
  ContactChangeModal: (props: any) =>
    props.open ? (
      <div data-testid="contact-change-modal" data-channel={props.channel}>
        <button type="button" onClick={props.onSuccess}>
          stub-success
        </button>
        <button type="button" onClick={props.onClose}>
          stub-close
        </button>
      </div>
    ) : null,
}));

import { toast } from 'sonner';
import { Profile } from './Profile';

describe('Profile — блок «Аккаунт (вход)»', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = MOCK_USER;
    mockIsAuthed = true;
  });

  it('показывает телефон и email входа с бейджем «Подтверждён» по is_*_verified', () => {
    render(<Profile />);
    expect(screen.getByText(ru.account.profile.accountSection)).toBeInTheDocument();
    expect(screen.getByText(ru.account.profile.loginPhone)).toBeInTheDocument();
    expect(screen.getByText('+998901234567')).toBeInTheDocument();
    expect(screen.getByText('user@example.com')).toBeInTheDocument();
    // Телефон подтверждён (is_phone_verified: true) — ровно один бейдж «Подтверждён».
    expect(screen.getAllByText(ru.account.profile.verified)).toHaveLength(1);
  });

  it('клик «Изменить» у телефона открывает ContactChangeModal с channel=SMS', () => {
    render(<Profile />);
    const changeButtons = screen.getAllByText(ru.account.profile.change);
    fireEvent.click(changeButtons[0]);
    const modal = screen.getByTestId('contact-change-modal');
    expect(modal).toHaveAttribute('data-channel', 'SMS');
  });

  it('клик «Изменить» у email открывает ContactChangeModal с channel=EMAIL', () => {
    render(<Profile />);
    const changeButtons = screen.getAllByText(ru.account.profile.change);
    fireEvent.click(changeButtons[1]);
    const modal = screen.getByTestId('contact-change-modal');
    expect(modal).toHaveAttribute('data-channel', 'EMAIL');
  });

  it('onSuccess модалки тостит и закрывает её', async () => {
    render(<Profile />);
    fireEvent.click(screen.getAllByText(ru.account.profile.change)[0]);
    fireEvent.click(screen.getByText('stub-success'));
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(screen.queryByTestId('contact-change-modal')).not.toBeInTheDocument();
  });

  it('свободная форма больше не содержит поле email', () => {
    render(<Profile />);
    expect(screen.queryByText(ru.account.profile.email)).not.toBeInTheDocument();
  });

  it('гость видит предложение войти', () => {
    mockIsAuthed = false;
    mockUser = null;
    render(<Profile />);
    expect(screen.getByText(ru.account.profile.authTitle)).toBeInTheDocument();
  });
});
