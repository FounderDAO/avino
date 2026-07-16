/**
 * Тесты SupportModal: валидация обязательных полей, успешная отправка,
 * ошибка API. next-intl мокается key→key; мутация — vi.fn().
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SupportModal } from './SupportModal';

vi.mock('next-intl', () => ({
  useTranslations: (ns?: string) => (key: string) => (ns ? `${ns}.${key}` : key),
}));

vi.mock('@/store/hooks', () => ({
  useAppSelector: () => null, // гость
}));

vi.mock('@/store/slices/authSlice', () => ({
  selectCurrentUser: vi.fn(),
}));

const mockUnwrap = vi.fn();
const mockCreate = vi.fn(() => ({ unwrap: mockUnwrap }));
vi.mock('@/store/api/supportApi', () => ({
  useCreateSupportRequestMutation: () => [mockCreate, { isLoading: false }],
}));

vi.mock('@/store/api/apiError', () => ({
  getApiError: () => undefined,
}));

beforeEach(() => {
  mockCreate.mockClear();
  mockUnwrap.mockReset();
});

function fill(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe('SupportModal', () => {
  it('не отправляет без контакта и показывает подсказку', () => {
    render(<SupportModal open onOpenChange={() => {}} />);
    fill('help.contact.messageLabel', 'Вопрос по объявлению');
    fireEvent.click(screen.getByText('help.contact.submit'));
    expect(screen.getByText('help.contact.contactRequired')).toBeInTheDocument();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('отправляет обращение и показывает успех', async () => {
    mockUnwrap.mockResolvedValue({ id: 'sr1', status: 'NEW' });
    render(<SupportModal open onOpenChange={() => {}} />);
    fill('help.contact.nameLabel', 'Али');
    fill('help.contact.contactLabel', '+998901234567');
    fill('help.contact.messageLabel', 'Не могу изменить объявление');
    fireEvent.click(screen.getByText('help.contact.submit'));

    await waitFor(() => {
      expect(screen.getByText('help.contact.success')).toBeInTheDocument();
    });
    expect(mockCreate).toHaveBeenCalledWith({
      name: 'Али',
      contact: '+998901234567',
      message: 'Не могу изменить объявление',
    });
  });

  it('показывает ошибку при падении API', async () => {
    mockUnwrap.mockRejectedValue(new Error('boom'));
    render(<SupportModal open onOpenChange={() => {}} />);
    fill('help.contact.contactLabel', '+998901234567');
    fill('help.contact.messageLabel', 'Вопрос');
    fireEvent.click(screen.getByText('help.contact.submit'));

    await waitFor(() => {
      expect(screen.getByText('help.contact.error')).toBeInTheDocument();
    });
  });
});
