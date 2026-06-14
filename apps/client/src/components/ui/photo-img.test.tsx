/**
 * PhotoImg — фоллбэк-плейсхолдер для объявлений без фото (TASK-197).
 *
 * Раньше плейсхолдер показывался только при ошибке загрузки; листинги без фото
 * получали внешний URL placehold.co и грузили серую плашку. Теперь пустой/
 * отсутствующий src сразу рисует осмысленный брендовый плейсхолдер, без <img>
 * и без внешнего хотлинка.
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

  it('реальный src → рендерит <img> с этим адресом', () => {
    const { container } = render(<PhotoImg src="https://x/a.jpg" alt="фото" />);
    expect(container.querySelector('img')?.getAttribute('src')).toBe(
      'https://x/a.jpg',
    );
  });
});
