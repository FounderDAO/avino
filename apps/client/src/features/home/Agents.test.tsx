/**
 * Agents — блок агентов на главной (реальный API §21, TASK-4 PR2).
 *
 * Проверяем: рендер по пропсам (без getAgents()), карточка ссылается на
 * /agents/:id, агентство null → строка скрыта, пустой список → блок не
 * рендерится (return null, без пустой «дырки» на главной).
 */
import * as React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Agent } from '@/lib/api/agents';

vi.mock('@/i18n/navigation', () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

// next-intl резолвер по реальному messages/ru.json (как в Hero.test).
vi.mock('next-intl', async () => {
  const ru = (await import('../../../messages/ru.json')).default as Record<
    string,
    unknown
  >;
  const useTranslations =
    (ns: string) =>
    (key: string, vars?: Record<string, unknown>): string => {
      const root = (ns ? ru[ns] : ru) as Record<string, unknown>;
      const val = key
        .split('.')
        .reduce<unknown>(
          (o, k) =>
            o && typeof o === 'object'
              ? (o as Record<string, unknown>)[k]
              : undefined,
          root,
        );
      return typeof val === 'string'
        ? vars
          ? val.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''))
          : val
        : key;
    };
  return { useTranslations };
});

import { Agents } from './Agents';

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
    render(<Agents agents={AGENTS} />);

    const link1 = screen.getByRole('link', { name: /Дилноза Каримова/ });
    expect(link1).toHaveAttribute('href', '/agents/ag-1');
    const link2 = screen.getByRole('link', { name: /Жасур Тошпулатов/ });
    expect(link2).toHaveAttribute('href', '/agents/ag-2');

    expect(screen.getByText('Estate Group')).toBeInTheDocument();
    expect(screen.getByText('14 объявлений')).toBeInTheDocument();
    expect(screen.getByText('3 объявлений')).toBeInTheDocument();
  });

  it('avatarUrl есть → <img>, нет → инициал имени', () => {
    const { container } = render(<Agents agents={AGENTS} />);

    // decorative alt="" → роль "presentation", не "img" — берём через querySelector.
    const img = container.querySelector('img');
    expect(img).toHaveAttribute('src', AGENTS[0].avatarUrl);
    // Второй агент без avatarUrl — инициал вместо фото.
    expect(screen.getByText('Ж')).toBeInTheDocument();
  });

  it('agencyName = null → строка агентства скрыта', () => {
    render(<Agents agents={AGENTS} />);
    // У ag-2 (agencyName: null) нет второй строки с названием агентства.
    expect(screen.queryByText('Estate Group')).toBeInTheDocument();
    expect(screen.queryByText(/null/i)).not.toBeInTheDocument();
  });

  it('пустой список агентов → блок не рендерится', () => {
    const { container } = render(<Agents agents={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
