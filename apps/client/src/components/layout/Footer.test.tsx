/**
 * Тесты Footer — проп variant: 'default' (широкая сетка страницы) и 'panel'
 * (компакт для скроллящейся колонки списка /map и /search, спека 2026-07-17).
 * Проверяем поведение: обе версии рендерят contentinfo, слоган и все ссылки.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Footer } from './Footer';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock('./Logo', () => ({
  Logo: () => <div data-testid="logo" />,
}));

describe('Footer', () => {
  it.each(['default', 'panel'] as const)(
    'variant=%s: contentinfo со слоганом и всеми ссылками',
    (variant) => {
      render(<Footer variant={variant} />);
      expect(screen.getByRole('contentinfo')).toBeInTheDocument();
      expect(screen.getByText('slogan')).toBeInTheDocument();
      // 16 ссылок колонок + 4 соц-иконки
      expect(screen.getAllByRole('link')).toHaveLength(20);
    },
  );

  it('panel: без внешнего mt-2 (футер вплотную к списку)', () => {
    render(<Footer variant="panel" />);
    expect(screen.getByRole('contentinfo')).not.toHaveClass('mt-2');
  });

  it('default (без пропа): внешний mt-2 сохраняется', () => {
    render(<Footer />);
    expect(screen.getByRole('contentinfo')).toHaveClass('mt-2');
  });
});
