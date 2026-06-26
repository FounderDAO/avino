/**
 * Тесты ShareButton + ShareModal.
 * Паттерн: vi.mock 'next-intl' с ключами из ru.json, мок clipboard и location.
 */
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ru from '../../../messages/ru.json';

// ─── Моки ─────────────────────────────────────────────────────────────────────

// next-intl: возвращает строку по ключу из ru[ns]
vi.mock('next-intl', () => ({
  useTranslations: (ns: string) =>
    (k: string, params?: Record<string, string>) => {
      const val =
        (ru as unknown as Record<string, Record<string, string>>)[ns]?.[k] ?? k;
      // Простая интерполяция {key} → значение из params
      if (params) {
        return val.replace(/\{(\w+)\}/g, (_: string, p: string) => params[p] ?? p);
      }
      return val;
    },
}));

// usePriceFormatter — возвращает статичную отформатированную цену
vi.mock('@/lib/usePriceFormatter', () => ({
  usePriceFormatter: () => ({
    display: 'UZS',
    price: () => '500 000 $',
    pin: () => '500K',
  }),
}));

// specs/propertyTypeLabel — достаточно пустых заглушек
vi.mock('@/lib/format', () => ({
  specs: () => ['3 комн', '85 м²'],
  propertyTypeLabel: () => 'Квартира',
}));

// PhotoImg — простой img-заглушка
vi.mock('@/components/ui/photo-img', () => ({
  // eslint-disable-next-line @next/next/no-img-element
  PhotoImg: ({ alt }: { alt: string }) => <img alt={alt} />,
}));

// navigator.clipboard.writeText
const mockWriteText = vi.fn(() => Promise.resolve());
Object.defineProperty(navigator, 'clipboard', {
  value: { writeText: mockWriteText },
  writable: true,
});

// window.location.href
Object.defineProperty(window, 'location', {
  value: { href: 'https://avino.uz/listing/L1' },
  writable: true,
});

// ─── Импорт после моков ───────────────────────────────────────────────────────

import { ShareButton } from './ShareButton';
import type { Listing } from '@/lib/mock/types';

const listing = {
  id: 'L1',
  title: 'Квартира в центре',
  price: 500000,
  currency: 'USD',
  tx: 'SALE',
  type: 'APARTMENT',
  photos: ['https://cdn.avino.uz/photo1.jpg'],
  district: 'Юнусабадский',
  address: 'ул. Мирзо Улугбека 45',
} as unknown as Listing;

// ─── Тесты ────────────────────────────────────────────────────────────────────

describe('ShareButton', () => {
  beforeEach(() => {
    mockWriteText.mockClear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('рендерит кнопку с доступным именем (aria-label)', () => {
    render(<ShareButton listing={listing} />);
    expect(screen.getByRole('button', { name: ru.share.button })).toBeInTheDocument();
  });

  it('клик открывает модал с заголовком', () => {
    render(<ShareButton listing={listing} />);
    fireEvent.click(screen.getByRole('button', { name: ru.share.button }));
    expect(screen.getByText(ru.share.title)).toBeInTheDocument();
  });

  it('кнопка «Копировать» вызывает clipboard.writeText с URL и показывает «Скопировано»', async () => {
    render(<ShareButton listing={listing} />);
    fireEvent.click(screen.getByRole('button', { name: ru.share.button }));

    const copyBtn = screen.getByRole('button', { name: ru.share.copy });
    await act(async () => {
      fireEvent.click(copyBtn);
    });

    expect(mockWriteText).toHaveBeenCalledWith('https://avino.uz/listing/L1');
    await waitFor(() => {
      expect(screen.getByText(ru.share.copied)).toBeInTheDocument();
    });

    // Через 2с метка сбрасывается обратно
    act(() => {
      vi.advanceTimersByTime(2100);
    });
    expect(screen.getByText(ru.share.copy)).toBeInTheDocument();
  });

  it('ссылка Telegram содержит t.me/share/url', () => {
    render(<ShareButton listing={listing} />);
    fireEvent.click(screen.getByRole('button', { name: ru.share.button }));
    const tgLink = screen.getByRole('link', { name: ru.share.telegram });
    expect(tgLink).toHaveAttribute('href', expect.stringContaining('t.me/share/url'));
  });

  it('ссылка WhatsApp содержит wa.me', () => {
    render(<ShareButton listing={listing} />);
    fireEvent.click(screen.getByRole('button', { name: ru.share.button }));
    const waLink = screen.getByRole('link', { name: ru.share.whatsapp });
    expect(waLink).toHaveAttribute('href', expect.stringContaining('wa.me'));
  });

  it('ссылка Email содержит mailto:', () => {
    render(<ShareButton listing={listing} />);
    fireEvent.click(screen.getByRole('button', { name: ru.share.button }));
    const mailLink = screen.getByRole('link', { name: ru.share.email });
    expect(mailLink).toHaveAttribute('href', expect.stringContaining('mailto:'));
  });
});
