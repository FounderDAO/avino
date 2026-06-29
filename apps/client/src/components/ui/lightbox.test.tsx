/**
 * Lightbox — регресс-гард под фикс «лайтбокс внутри модалки деталки».
 *
 * Лайтбокс порталится в document.body. Внутри radix Dialog (ListingModal) body
 * получает pointer-events:none, а Radix закрывает модалку на «клик снаружи».
 * Поэтому корень лайтбокса ОБЯЗАН иметь:
 *  - класс `pointer-events-auto` (иначе лайтбокс некликабелен внутри модалки);
 *  - атрибут `data-lightbox` (по нему ListingModal гасит dismiss/escape).
 * Удаление любого из них вернёт баг — этот тест его ловит.
 */
import * as React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import type { ListingPhoto } from '@/lib/mock/types';

vi.mock('next-intl', () => ({
  useTranslations: () => (k: string) => k,
}));

vi.mock('./photo-img', () => ({
  PhotoImg: ({ src, alt }: { src: string; alt?: string }) => (
    // eslint-disable-next-line @next/next/no-img-element -- тестовая заглушка
    <img src={src} alt={alt ?? ''} />
  ),
}));

import { Lightbox } from './lightbox';

const photos: ListingPhoto[] = [
  { url: 'https://x/1.jpg', thumb: 'https://x/1t.jpg' },
  { url: 'https://x/2.jpg', thumb: 'https://x/2t.jpg' },
];

describe('Lightbox — маркеры для работы внутри модалки', () => {
  it('корень имеет [data-lightbox] и класс pointer-events-auto', () => {
    render(
      <Lightbox
        photos={photos}
        index={0}
        onIndexChange={() => {}}
        onClose={() => {}}
        alt="x"
      />,
    );
    const root = document.querySelector('[data-lightbox]');
    expect(root).not.toBeNull();
    expect(root).toHaveClass('pointer-events-auto');
  });
});
