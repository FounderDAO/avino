/**
 * AgentsCatalog — каталог /agents с дозагрузкой «Показать ещё».
 *
 * Проверяем: кнопка видна только пока загружено меньше total, клик дотягивает
 * следующую страницу и дописывает её к SSR-выдаче, после исчерпания каталога
 * кнопка пропадает. RTK Query мокируется на уровне useLazyAgentsPageQuery —
 * сеть в юнит-тесте не поднимаем (как в Tours.test.tsx).
 */
import * as React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import ru from '../../../messages/ru.json';
import type { Agent } from '@/lib/api/agents';

vi.mock('@/i18n/navigation', () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const loadPage = vi.fn();
vi.mock('@/store/api/agentsApi', () => ({
  useLazyAgentsPageQuery: () => [loadPage, { isFetching: false }],
}));

import { AgentsCatalog } from './AgentsCatalog';

const agent = (n: number): Agent => ({
  id: `ag-${n}`,
  name: `Агент ${n}`,
  avatarUrl: null,
  agencyName: null,
  about: null,
  activeListingsCount: n,
});

function renderCatalog(props: React.ComponentProps<typeof AgentsCatalog>) {
  return render(
    <NextIntlClientProvider locale="ru" messages={ru}>
      <AgentsCatalog {...props} />
    </NextIntlClientProvider>,
  );
}

describe('AgentsCatalog', () => {
  beforeEach(() => loadPage.mockReset());

  it('загружено меньше total → кнопка «Показать ещё» видна', () => {
    renderCatalog({ initialAgents: [agent(1), agent(2)], total: 37 });
    expect(screen.getByRole('button', { name: 'Показать ещё' })).toBeInTheDocument();
  });

  it('клик дотягивает следующую страницу и дописывает её к выдаче', async () => {
    loadPage.mockReturnValue({
      unwrap: async () => ({ agents: [agent(3)], total: 3 }),
    });
    renderCatalog({ initialAgents: [agent(1), agent(2)], total: 3 });

    await userEvent.click(screen.getByRole('button', { name: 'Показать ещё' }));

    // Запрошена именно вторая страница тем же размером, что и SSR.
    expect(loadPage).toHaveBeenCalledWith({ page: 2, limit: 24 });
    await waitFor(() => expect(screen.getByText('Агент 3')).toBeInTheDocument());
    // SSR-агенты остались на месте — страница дописывается, а не заменяет.
    expect(screen.getByText('Агент 1')).toBeInTheDocument();
  });

  it('каталог исчерпан (загружено = total) → кнопки нет', () => {
    renderCatalog({ initialAgents: [agent(1), agent(2)], total: 2 });
    expect(screen.queryByRole('button', { name: 'Показать ещё' })).not.toBeInTheDocument();
  });

  it('пустой каталог → сообщение вместо сетки', () => {
    renderCatalog({ initialAgents: [], total: 0 });
    expect(screen.getByText(ru.agentsCatalog.empty)).toBeInTheDocument();
  });
});
