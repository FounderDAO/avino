/**
 * Districts — популярные районы города Ташкента на главной: горизонтальный чип
 * (смысловая лайн-иконка в бейдже + название).
 *
 * Подборка курируемая и статичная (НЕ из GET /geo/districts) — раньше в сетку
 * попадали случайные районы всей страны с непереведённым `name_en` («… tumani»).
 * Проверяем: рендерятся ровно 6 центральных районов Ташкента, ссылки на
 * /search?district_id=, у каждой плитки есть svg-иконка, название видно, и что в
 * EN имена чистые (Mirabad, а не «… tumani»).
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

describe('Districts (курируемые районы Ташкента: чип с иконкой)', () => {
  it('рендерит 6 районов Ташкента; плитка ссылается на /search?district_id=, содержит svg-иконку и название', async () => {
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
    // У плитки Мирабада — векторная иконка (не фото).
    expect(link.querySelector('svg')).not.toBeNull();

    // Иконки во всех 6 плитках; размытых фото больше нет.
    expect(container.querySelectorAll('a svg')).toHaveLength(6);
    expect(container.querySelector('img')).toBeNull();

    // Название района видно как текст.
    expect(screen.getByText('Мирабад')).toBeInTheDocument();
  });

  it('в EN имена районов чистые (Mirabad, без суффикса «tumani»)', async () => {
    getLocale.mockResolvedValue('en');
    render(await Districts());

    expect(screen.getByText('Mirabad')).toBeInTheDocument();
    expect(screen.getByText('Mirzo-Ulugbek')).toBeInTheDocument();
    expect(screen.queryByText(/tumani/i)).toBeNull();
  });
});
