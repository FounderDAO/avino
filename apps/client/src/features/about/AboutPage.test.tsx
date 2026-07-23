/**
 * Смоук AboutPage: страница рендерится с реальным ru.json (проверяем, что все
 * ключи неймспейса `about` на месте — иначе next-intl бросил бы на t('...')),
 * секции присутствуют и нижние CTA ведут в /sell и /become-agent.
 * next-intl НЕ мокируется — настоящий провайдер, как в AgentProfile.test.tsx.
 */
import * as React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import ru from '../../../messages/ru.json';

vi.mock('@/i18n/navigation', () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

import { AboutPage } from './AboutPage';

function renderAbout() {
  return render(
    <NextIntlClientProvider locale="ru" messages={ru}>
      <AboutPage />
    </NextIntlClientProvider>,
  );
}

describe('AboutPage (/about)', () => {
  it('рендерит hero-заголовок и заголовки всех смысловых секций', () => {
    renderAbout();
    expect(
      screen.getByRole('heading', { level: 1, name: ru.about.hero.title }),
    ).toBeInTheDocument();
    expect(screen.getByText(ru.about.story.title)).toBeInTheDocument();
    expect(screen.getByText(ru.about.numbers.title)).toBeInTheDocument();
    expect(screen.getByText(ru.about.values.title)).toBeInTheDocument();
    expect(screen.getByText(ru.about.audience.title)).toBeInTheDocument();
    expect(screen.getByText(ru.about.contact.title)).toBeInTheDocument();
  });

  it('контакты: email-mailto и Telegram-ссылка', () => {
    renderAbout();
    expect(screen.getByRole('link', { name: /support@avino\.uz/ })).toHaveAttribute(
      'href',
      'mailto:support@avino.uz',
    );
    expect(screen.getByRole('link', { name: /@avino_uz/ })).toHaveAttribute(
      'href',
      'https://t.me/avino_uz',
    );
  });

  it('нижние CTA ведут в /sell и /become-agent', () => {
    renderAbout();
    expect(screen.getByRole('link', { name: ru.about.contact.postCta })).toHaveAttribute(
      'href',
      '/sell',
    );
    expect(screen.getByRole('link', { name: ru.about.contact.agentCta })).toHaveAttribute(
      'href',
      '/become-agent',
    );
  });
});
