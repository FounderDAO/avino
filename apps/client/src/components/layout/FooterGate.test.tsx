/**
 * Тесты FooterGate — глобальный футер скрыт на «фиксированных» страницах
 * /map и /search (там компактный футер внутри колонки списка), виден на
 * остальных маршрутах. Сравнение точное, путь без префикса локали.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { usePathname } from '@/i18n/navigation';
import { FooterGate } from './FooterGate';

vi.mock('@/i18n/navigation', () => ({
  usePathname: vi.fn(),
}));
vi.mock('./Footer', () => ({
  Footer: () => <footer data-testid="global-footer" />,
}));

describe('FooterGate', () => {
  beforeEach(() => vi.mocked(usePathname).mockReset());

  it.each(['/map', '/search'])('скрывает глобальный футер на %s', (path) => {
    vi.mocked(usePathname).mockReturnValue(path);
    render(<FooterGate />);
    expect(screen.queryByTestId('global-footer')).toBeNull();
  });

  // '/mapx' — точное совпадение: похожие пути футер НЕ теряют.
  it.each(['/', '/help', '/mapx'])('рендерит футер на %s', (path) => {
    vi.mocked(usePathname).mockReturnValue(path);
    render(<FooterGate />);
    expect(screen.getByTestId('global-footer')).toBeInTheDocument();
  });
});
