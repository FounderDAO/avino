/**
 * Districts — популярные районы на главной: размытое фото + «матовое стекло».
 *
 * Раньше карточка показывала случайное Unsplash-фото (чужие города) с подписью
 * снизу. Теперь фото размыто (blur) и служит цветовым фоном, а название района
 * — по центру в glassmorphism-чипе (backdrop-blur). Проверяем: ссылки на
 * /search?district_id=, blur-класс на фото, название в стеклянном чипе,
 * пустой список районов → секция не рендерится.
 *
 * Districts — async server component: рендерим через `render(await Districts())`
 * с моками next-intl/server и слоя гео-API.
 */
import * as React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { District } from '@/lib/mock/types';

vi.mock('@/i18n/navigation', () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('next-intl/server', () => ({
  getLocale: vi.fn(async () => 'ru'),
  getTranslations: vi.fn(async () => (key: string) =>
    key === 'districts.title' ? 'Популярные места Ташкента' : key,
  ),
}));

const getDistricts = vi.fn<(locale: string) => Promise<District[]>>();
vi.mock('@/lib/api/geo', () => ({
  getDistricts: (locale: string) => getDistricts(locale),
}));

import { Districts } from './Districts';

const DISTRICTS: District[] = [
  { id: 'd-1', name: 'Акалтынский район' },
  { id: 'd-2', name: 'Алатский район' },
];

describe('Districts (размытое фото + стеклянный чип с названием)', () => {
  beforeEach(() => {
    getDistricts.mockReset();
  });

  it('карточка ссылается на /search?district_id=, фото размыто, имя — в стеклянном чипе', async () => {
    getDistricts.mockResolvedValue(DISTRICTS);
    const { container } = render(await Districts());

    // Ссылки плиток не изменились.
    const link = screen.getByRole('link', { name: /Акалтынский район/ });
    expect(link).toHaveAttribute('href', '/search?tx=SALE&district_id=d-1');

    // Фото размыто (нечитаемый цветовой фон, а не «чужой город»).
    const img = container.querySelector('img');
    expect(img?.className).toContain('blur-');

    // Название района — в центрированном glassmorphism-чипе.
    const chip = screen.getByText('Акалтынский район');
    expect(chip.closest('[class*="backdrop-blur"]')).not.toBeNull();
  });

  it('пустой список районов → секция не рендерится', async () => {
    getDistricts.mockResolvedValue([]);
    const { container } = render(await Districts());
    expect(container).toBeEmptyDOMElement();
  });
});
