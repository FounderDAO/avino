/**
 * Gallery — оверлей «1 / N» + «Показать все фото» на главном фото (TASK-198).
 *
 * Проверяем:
 * - Оверлей не рендерится при единственном фото.
 * - Счётчик «1 / N» и кнопка «Показать все» видны при photos.length > 1.
 * - Клик по кнопке «Показать все» открывает лайтбокс.
 * - Клик по главному фото (div[role=button]) тоже открывает лайтбокс.
 * - При одном фото — Lightbox не появляется без клика.
 *
 * Lightbox замокан, чтобы не тащить его CSS/portal-логику в тест галереи.
 */
import * as React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ListingPhoto } from '@/lib/mock/types';

// ── Моки зависимостей ─────────────────────────────────────────────────────────

// next-intl: резолвер по реальному messages/ru.json (как в Hero.test).
vi.mock('next-intl', async () => {
  const ru = (await import('../../../messages/ru.json')).default as Record<
    string,
    unknown
  >;
  const useTranslations =
    (ns: string) =>
    (key: string, vars?: Record<string, unknown>): string => {
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
      return typeof val === 'string'
        ? vars
          ? val.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''))
          : val
        : key;
    };
  return { useTranslations, useLocale: () => 'ru' };
});

// PhotoImg: рендерим обычный <img> без Next.js обёртки.
vi.mock('./photo-img', () => ({
  PhotoImg: ({ src, alt, className }: { src: string; alt?: string; className?: string }) => (
    // eslint-disable-next-line @next/next/no-img-element -- тестовая заглушка
    <img src={src} alt={alt ?? ''} className={className} />
  ),
}));

// Lightbox: минимальная заглушка — выводим маркер присутствия.
vi.mock('./lightbox', () => ({
  Lightbox: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="lightbox">
      <button type="button" onClick={onClose}>
        Закрыть
      </button>
    </div>
  ),
}));

import { Gallery } from './gallery';

// ── Тестовые данные ───────────────────────────────────────────────────────────

const one: ListingPhoto[] = [
  { url: 'https://x/1.jpg', thumb: 'https://x/1t.jpg' },
];

const many: ListingPhoto[] = [
  { url: 'https://x/1.jpg', thumb: 'https://x/1t.jpg' },
  { url: 'https://x/2.jpg', thumb: 'https://x/2t.jpg' },
  { url: 'https://x/3.jpg', thumb: 'https://x/3t.jpg' },
];

// ── Тесты ─────────────────────────────────────────────────────────────────────

describe('Gallery — оверлей (TASK-198)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('пустой массив photos → плейсхолдер, без оверлея', () => {
    render(<Gallery photos={[]} alt="нет фото" />);
    expect(screen.queryByText(/\/ \d/)).toBeNull();
    expect(screen.queryByTestId('lightbox')).toBeNull();
  });

  it('одно фото → счётчика и кнопки «Показать все» нет', () => {
    render(<Gallery photos={one} alt="квартира" />);
    expect(screen.queryByText('1 / 1')).toBeNull();
    expect(screen.queryByText(/Показать/i)).toBeNull();
  });

  it('несколько фото → счётчик «1 / N» виден', () => {
    render(<Gallery photos={many} alt="квартира" />);
    // ru.json: gallery.counter = "{current} / {total}"
    expect(screen.getByText('1 / 3')).toBeInTheDocument();
  });

  it('несколько фото → кнопка «Показать все фото» видна', () => {
    render(<Gallery photos={many} alt="квартира" />);
    expect(
      screen.getByRole('button', { name: /показать все/i }),
    ).toBeInTheDocument();
  });

  it('клик по кнопке «Показать все фото» → лайтбокс открывается', async () => {
    const user = userEvent.setup();
    render(<Gallery photos={many} alt="квартира" />);
    const btn = screen.getByRole('button', { name: /показать все/i });
    await user.click(btn);
    expect(screen.getByTestId('lightbox')).toBeInTheDocument();
  });

  it('клик по главному фото → лайтбокс открывается', async () => {
    const user = userEvent.setup();
    render(<Gallery photos={many} alt="квартира" />);
    // Главное фото обёрнуто в div[role=button]
    const mainPhoto = screen.getByRole('button', { name: /1.*3/i });
    await user.click(mainPhoto);
    expect(screen.getByTestId('lightbox')).toBeInTheDocument();
  });

  it('закрытие лайтбокса → лайтбокс исчезает', async () => {
    const user = userEvent.setup();
    render(<Gallery photos={many} alt="квартира" />);
    await user.click(screen.getByRole('button', { name: /показать все/i }));
    expect(screen.getByTestId('lightbox')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Закрыть' }));
    expect(screen.queryByTestId('lightbox')).toBeNull();
  });
});
