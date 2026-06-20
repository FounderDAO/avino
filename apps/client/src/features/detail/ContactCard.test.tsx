/**
 * ContactCard — регрессионные тесты двух багов карточки контакта:
 *   1. «Показать телефон» не должен быть «мёртвой» кнопкой: если у автора нет
 *      телефона (owner без contact_phone), кнопка вообще не показывается; если
 *      телефон есть — клик раскрывает номер (tel-ссылка).
 *   2. Гость, нажав «Написать», должен увидеть модалку входа (а не редирект на
 *      главную). После входа намерение продолжается — создаётся диалог.
 *
 * Слои RTK Query / Redux / i18n-навигация замоканы — проверяем проводку
 * компонента, а не сеть.
 */
import * as React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Listing } from '@/lib/mock/types';

const { createSpy, pushSpy } = vi.hoisted(() => ({
  createSpy: vi.fn(),
  pushSpy: vi.fn(),
}));

// Управляемое состояние авторизации для useAppSelector(selectIsAuthenticated).
let mockAuthed = false;

// next-intl: резолвер по реальному messages/ru.json (как в LoginModal.test).
vi.mock('next-intl', async () => {
  const ru = (await import('../../../messages/ru.json')).default as Record<
    string,
    unknown
  >;
  const useTranslations =
    (ns: string) =>
    (key: string): string => {
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
      return typeof val === 'string' ? val : key;
    };
  return { useTranslations };
});

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: pushSpy }),
}));

// ContactCard вызывает только useAppSelector(selectIsAuthenticated).
vi.mock('@/store/hooks', () => ({
  useAppSelector: () => mockAuthed,
}));

vi.mock('@/store/api/chatApi', () => ({
  useCreateThreadMutation: () => [createSpy, { isLoading: false }],
}));

// LoginModal и FavButton тянут собственные стораджи — заменяем лёгкими стабами.
vi.mock('@/components/layout/LoginModal', () => ({
  LoginModal: ({ open }: { open: boolean }) =>
    open ? <div data-testid="login-modal" /> : null,
}));
vi.mock('@/components/ui/fav-button', () => ({
  FavButton: () => <button type="button">fav</button>,
}));

import { ContactCard } from './ContactCard';

function makeListing(phone?: string): Listing {
  return {
    id: 'lst-1',
    tx: 'SALE',
    type: 'APARTMENT',
    promo: 'none',
    price: 95000,
    currency: 'USD',
    title: 'Тестовое объявление',
    desc: '',
    address: '',
    district: '',
    photos: [],
    agent: { name: 'Тимур Сафаров', pro: false, agency: '', phone },
  } as unknown as Listing;
}

describe('ContactCard', () => {
  beforeEach(() => {
    mockAuthed = false;
    createSpy.mockReturnValue({ unwrap: () => Promise.resolve({ id: 'th-1' }) });
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('не показывает «Показать телефон», если у автора нет телефона', () => {
    render(<ContactCard listing={makeListing(undefined)} />);
    expect(screen.queryByText('Показать телефон')).not.toBeInTheDocument();
  });

  it('раскрывает номер по клику, если телефон есть', async () => {
    const user = userEvent.setup();
    render(<ContactCard listing={makeListing('+998 90 123-45-67')} />);
    const btn = screen.getByText('Показать телефон');
    await user.click(btn);
    const link = screen.getByRole('link', { name: /\+998 90 123-45-67/ });
    expect(link).toHaveAttribute('href', 'tel:+99890123-45-67');
  });

  it('гость по «Написать» видит модалку входа, без редиректа и без создания диалога', async () => {
    const user = userEvent.setup();
    render(<ContactCard listing={makeListing('+998 90 123-45-67')} />);
    await user.click(screen.getByText('Написать'));
    expect(screen.getByTestId('login-modal')).toBeInTheDocument();
    expect(pushSpy).not.toHaveBeenCalled();
    expect(createSpy).not.toHaveBeenCalled();
  });

  it('авторизованный по «Написать» создаёт диалог и уходит в инбокс', async () => {
    mockAuthed = true;
    const user = userEvent.setup();
    render(<ContactCard listing={makeListing('+998 90 123-45-67')} />);
    await user.click(screen.getByText('Написать'));
    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({ listing_id: 'lst-1' }),
    );
  });

  it('после входа гостя намерение «Написать» продолжается автоматически', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <ContactCard listing={makeListing('+998 90 123-45-67')} />,
    );
    await user.click(screen.getByText('Написать'));
    expect(createSpy).not.toHaveBeenCalled();
    // Гость вошёл → перерендер с авторизацией продолжает намерение.
    mockAuthed = true;
    rerender(<ContactCard listing={makeListing('+998 90 123-45-67')} />);
    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({ listing_id: 'lst-1' }),
    );
  });
});
