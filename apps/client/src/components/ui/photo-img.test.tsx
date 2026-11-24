/**
 * PhotoImg — фоллбэк-плейсхолдер для объявлений без фото (TASK-197).
 *
 * Раньше плейсхолдер показывался только при ошибке загрузки; листинги без фото
 * получали внешний URL placehold.co и грузили серую плашку. Теперь пустой/
 * отсутствующий src сразу рисует осмысленный брендовый плейсхолдер, без <img>
 * и без внешнего хотлинка.
 *
 * После миграции на next/image (ADR-0104) src прокидывается через
 * /_next/image?url=... — проверяем наличие <img> и присутствие оригинального
 * url в атрибуте src (encoded).
 */
import * as React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PhotoImg } from './photo-img';

describe('PhotoImg — плейсхолдер без фото (TASK-197)', () => {
  it('пустой src → плейсхолдер (role=img), без <img>', () => {
    const { container } = render(<PhotoImg src="" alt="нет фото" />);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByRole('img')).toHaveAttribute('aria-label', 'нет фото');
  });

  it('реальный src → рендерит <img>, src содержит оригинальный url', () => {
    const { container } = render(<PhotoImg src="https://cdn.avino.uz/a.jpg" alt="фото" />);
    const img = container.querySelector('img');
    // next/image переписывает src → /_next/image?url=<encoded-original>
    expect(img).not.toBeNull();
    expect(img?.getAttribute('src')).toContain('cdn.avino.uz');
  });

  it('фото из хранилища → грузится напрямую, без /_next/image и srcset', () => {
    const url = 'https://acc.r2.cloudflarestorage.com/b/listings/x-640.webp?X-Amz-Signature=abc';
    const { container } = render(<PhotoImg src={url} alt="фото" />);
    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toBe(url);
    expect(img?.getAttribute('srcset')).toBeNull();
  });

  it('локальная картинка → через оптимизатор /_next/image', () => {
    const { container } = render(<PhotoImg src="/hero/tashkent.jpg" alt="" />);
    expect(container.querySelector('img')?.getAttribute('src')).toContain('/_next/image');
  });
});
