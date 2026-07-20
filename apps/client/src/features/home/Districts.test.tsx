/**
 * Districts — популярные районы города Ташкента на главной: размытое фото +
 * «матовое стекло».
 *
 * Подборка теперь курируемая и статичная (НЕ из GET /geo/districts) — раньше в
 * сетку попадали случайные районы всей страны с непереведённым `name_en`
 * («… tumani»). Проверяем: рендерятся ровно 6 центральных районов Ташкента,
 * ссылки на /search?district_id=, blur-класс на фото, имя в стеклянном чипе,
 * и что в EN имена чистые (Mirabad, а не «… tumani»).
 *
 * Districts — async server component: рендерим через `render(await Districts())`
 * с моками next-intl/server.
 */
import * as React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/i18n/navigation', () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const getLocale = vi.fn(async () => 'ru');
vi.mock('next-intl/server', () => ({
  getLocale: () => getLocale(),
  getTranslations: vi.fn(async () => (key: string) =>
    key === 'districts.title' ? 'Популярные места Ташкента' : key,
  ),
}));

import { Districts } from './Districts';

describe('Districts (курируемые районы Ташкента: размытое фото + стеклянный чип)', () => {
  it('рендерит 6 районов Ташкента; плитка ссылается на /search?district_id=, фото размыто, имя — в стеклянном чипе', async () => {
    getLocale.mockResolvedValue('ru');
    const { container } = render(await Districts());

    // Ровно 6 плиток (сетка 3×2), все — ссылки на поиск по district_id.
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(6);

    // Мирабад — курируемый район Ташкента с фиксированным UUID.
    const link = screen.getByRole('link', { name: /Мирабад/ });
    expect(link).toHaveAttribute(
      'href',
      '/search?tx=SALE&district_id=d0000000-0000-4000-8000-000000000003',
    );

    // Фото размыто (нечитаемый цветовой фон, а не «чужой город»).
    const img = container.querySelector('img');
    expect(img?.className).toContain('blur-');

    // Название района — в центрированном glassmorphism-чипе.
    const chip = screen.getByText('Мирабад');
    expect(chip.closest('[class*="backdrop-blur"]')).not.toBeNull();
  });

  it('в EN имена районов чистые (Mirabad, без суффикса «tumani»)', async () => {
    getLocale.mockResolvedValue('en');
    render(await Districts());

    expect(screen.getByText('Mirabad')).toBeInTheDocument();
    expect(screen.getByText('Mirzo-Ulugbek')).toBeInTheDocument();
    expect(screen.queryByText(/tumani/i)).toBeNull();
  });
});
