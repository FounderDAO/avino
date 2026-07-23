/**
 * Agents — блок агентов на главной (реальный API §21, TASK-4 PR2).
 *
 * Проверяем: рендер по пропсам (без getAgents()), карточка ссылается на
 * /agents/:id, агентство null → строка скрыта, пустой список → блок не
 * рендерится (return null, без пустой «дырки» на главной).
 *
 * next-intl НЕ мокируется вручную — рендерим через настоящий
 * NextIntlClientProvider с реальным messages/ru.json (как в
 * AgentProfile.test.tsx), чтобы ICU plural (`home.agents.listingsCount`)
 * раскрывался по-настоящему, а не подменялся упрощённым `{count}`-резолвером.
 */
import * as React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import ru from '../../../messages/ru.json';
import type { Agent } from '@/lib/api/agents';

vi.mock('@/i18n/navigation', () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

import { Agents } from './Agents';

/** Рендер с реальным next-intl провайдером (ICU plural резолвится по-настоящему). */
function renderAgents(props: React.ComponentProps<typeof Agents>) {
  return render(
    <NextIntlClientProvider locale="ru" messages={ru}>
      <Agents {...props} />
    </NextIntlClientProvider>,
  );
}

const AGENTS: Agent[] = [
  {
    id: 'ag-1',
    name: 'Дилноза Каримова',
    avatarUrl: 'https://cdn.avino.uz/ag-1/avatar.webp',
    agencyName: 'Estate Group',
    about: null,
    activeListingsCount: 14,
  },
  {
    id: 'ag-2',
    name: 'Жасур Тошпулатов',
    avatarUrl: null,
    agencyName: null,
    about: null,
    activeListingsCount: 3,
  },
];

describe('Agents (блок «Агенты» на главной, реальный API)', () => {
  it('рендерит карточки по пропсам, ссылки ведут на /agents/:id', () => {
    renderAgents({ agents: AGENTS, total: AGENTS.length });

    const link1 = screen.getByRole('link', { name: /Дилноза Каримова/ });
    expect(link1).toHaveAttribute('href', '/agents/ag-1');
    const link2 = screen.getByRole('link', { name: /Жасур Тошпулатов/ });
    expect(link2).toHaveAttribute('href', '/agents/ag-2');

    expect(screen.getByText('Estate Group')).toBeInTheDocument();
    // ICU plural (ru): 14 → many «объявлений», 3 → few «объявления».
    expect(screen.getByText('14 объявлений')).toBeInTheDocument();
    expect(screen.getByText('3 объявления')).toBeInTheDocument();
  });

  it('avatarUrl есть → <img>, нет → инициал имени', () => {
    const { container } = renderAgents({ agents: AGENTS, total: AGENTS.length });

    // decorative alt="" → роль "presentation", не "img" — берём через querySelector.
    const img = container.querySelector('img');
    expect(img).toHaveAttribute('src', AGENTS[0].avatarUrl);
    // Второй агент без avatarUrl — инициал вместо фото.
    expect(screen.getByText('Ж')).toBeInTheDocument();
  });

  it('agencyName = null → строка агентства скрыта', () => {
    renderAgents({ agents: AGENTS, total: AGENTS.length });
    // У ag-2 (agencyName: null) нет второй строки с названием агентства.
    expect(screen.queryByText('Estate Group')).toBeInTheDocument();
    expect(screen.queryByText(/null/i)).not.toBeInTheDocument();
  });

  it('агентов больше, чем показано → ссылка на полный каталог с общим числом', () => {
    renderAgents({ agents: AGENTS, total: 37 });

    const seeAll = screen.getByRole('link', { name: /Все агенты \(37\)/ });
    expect(seeAll).toHaveAttribute('href', '/agents');
  });

  it('показаны все агенты → ссылка на каталог всё равно есть (единственный вход в /agents)', () => {
    renderAgents({ agents: AGENTS, total: AGENTS.length });

    const seeAll = screen.getByRole('link', { name: /Все агенты \(2\)/ });
    expect(seeAll).toHaveAttribute('href', '/agents');
  });

  it('пустой список агентов → блок не рендерится', () => {
    const { container } = renderAgents({ agents: [], total: 0 });
    expect(container).toBeEmptyDOMElement();
  });
});
