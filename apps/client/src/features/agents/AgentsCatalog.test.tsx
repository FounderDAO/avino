/**
 * AgentsCatalog — каталог /agents: поиск, сортировка, «Показать ещё».
 *
 * Проверяем: локальный поиск фильтрует список и обновляет счётчик, сортировка
 * по имени переставляет строки, пустой результат поиска даёт noResults (а не
 * empty каталога), кнопка дозагрузки видна только пока загружено меньше total
 * и скрыта при активном поиске. RTK Query мокируется на уровне
 * useLazyAgentsPageQuery — сеть в юнит-тесте не поднимаем (как в Tours.test.tsx).
 *
 * next-intl здесь настоящий (NextIntlClientProvider + ru.json), поэтому
 * недостающий ключ развалит тест — это намеренно.
 */
import * as React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
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

const agent = (n: number, over: Partial<Agent> = {}): Agent => ({
  id: `ag-${n}`,
  name: `Агент ${n}`,
  avatarUrl: null,
  agencyName: null,
  about: null,
  activeListingsCount: n,
  ...over,
});

function renderCatalog(props: React.ComponentProps<typeof AgentsCatalog>) {
  return render(
    <NextIntlClientProvider locale="ru" messages={ru}>
      <AgentsCatalog {...props} />
    </NextIntlClientProvider>,
  );
}

/** Заголовки строк в порядке отрисовки. */
const renderedNames = () =>
  screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent?.trim() ?? '');

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

    expect(loadPage).toHaveBeenCalledWith({ page: 2, limit: 100 });
    await waitFor(() => expect(screen.getByText('Агент 3')).toBeInTheDocument());
    expect(screen.getByText('Агент 1')).toBeInTheDocument();
  });

  it('каталог исчерпан (загружено = total) → кнопки нет', () => {
    renderCatalog({ initialAgents: [agent(1), agent(2)], total: 2 });
    expect(
      screen.queryByRole('button', { name: 'Показать ещё' }),
    ).not.toBeInTheDocument();
  });

  it('пустой каталог → сообщение вместо списка', () => {
    renderCatalog({ initialAgents: [], total: 0 });
    expect(screen.getByText(ru.agentsCatalog.empty)).toBeInTheDocument();
  });

  it('поиск фильтрует по имени и агентству и обновляет счётчик', async () => {
    renderCatalog({
      initialAgents: [
        agent(1, { name: 'Алиса' }),
        agent(2, { name: 'Борис', agencyName: 'Golden House' }),
        agent(3, { name: 'Виктор' }),
      ],
      total: 3,
    });
    expect(screen.getByText('Найдено 3 агента')).toBeInTheDocument();

    await userEvent.type(screen.getByRole('searchbox'), 'golden');

    await waitFor(() => expect(renderedNames()).toEqual(['Борис']));
    expect(screen.getByText('Найден 1 агент')).toBeInTheDocument();
  });

  it('сортировка «По имени» переставляет строки, безымянные — в конец', async () => {
    renderCatalog({
      initialAgents: [
        agent(3, { name: 'Виктор' }),
        agent(2, { name: null, agencyName: 'Alpha' }),
        agent(1, { name: 'Алиса' }),
      ],
      total: 3,
    });
    expect(renderedNames()).toEqual(['Виктор', 'Alpha', 'Алиса']);

    await userEvent.click(
      screen.getByRole('button', { name: ru.agentsCatalog.sort.active }),
    );
    await userEvent.click(
      await screen.findByRole('menuitem', { name: ru.agentsCatalog.sort.name }),
    );

    await waitFor(() => expect(renderedNames()).toEqual(['Алиса', 'Виктор', 'Alpha']));
  });

  it('поиск ничего не нашёл → noResults и сброс поиска возвращает список', async () => {
    renderCatalog({ initialAgents: [agent(1), agent(2)], total: 2 });

    await userEvent.type(screen.getByRole('searchbox'), 'zzz');
    expect(await screen.findByText(ru.agentsCatalog.noResults)).toBeInTheDocument();
    // Пустой результат поиска ≠ пустой каталог.
    expect(screen.queryByText(ru.agentsCatalog.empty)).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('button', { name: ru.agentsCatalog.resetSearch }),
    );
    await waitFor(() => expect(renderedNames()).toHaveLength(2));
  });

  it('при активном поиске кнопка «Показать ещё» скрыта', async () => {
    renderCatalog({ initialAgents: [agent(1), agent(2)], total: 37 });
    expect(screen.getByRole('button', { name: 'Показать ещё' })).toBeInTheDocument();

    await userEvent.type(screen.getByRole('searchbox'), 'Агент 1');

    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Показать ещё' }),
      ).not.toBeInTheDocument(),
    );
  });

  it('строка агента ведёт на профиль и на его объявления', () => {
    renderCatalog({ initialAgents: [agent(1)], total: 1 });
    const row = screen.getByRole('article');

    expect(within(row).getByRole('link', { name: 'Профиль' })).toHaveAttribute(
      'href',
      '/agents/ag-1',
    );
    expect(within(row).getByRole('link', { name: 'Объявления' })).toHaveAttribute(
      'href',
      '/search?agent_id=ag-1',
    );
  });
});
