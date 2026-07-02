import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ru from '../../../messages/ru.json';

vi.mock('@/i18n/navigation', () => ({
  Link: (p: any) => (
    <a href={p.href} aria-label={p['aria-label']}>
      {p.children}
    </a>
  ),
}));
vi.mock('next-intl', () => ({
  useTranslations: (ns: string) => (k: string) =>
    k.split('.').reduce((o: any, p) => o?.[p], (ru as any)[ns]) ?? k,
}));

import { UnreadIndicators } from './UnreadIndicators';

describe('UnreadIndicators', () => {
  it('рендерит бейджи сообщений и уведомлений с верными ссылками', () => {
    render(<UnreadIndicators messages={3} notifications={5} />);
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByLabelText(ru.nav.messages)).toHaveAttribute(
      'href',
      '/account/inbox',
    );
    expect(screen.getByLabelText(ru.nav.notifications)).toHaveAttribute(
      'href',
      '/account/notifications',
    );
  });
  it('не рендерит бейдж при нуле', () => {
    render(<UnreadIndicators messages={0} notifications={0} />);
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });
});
