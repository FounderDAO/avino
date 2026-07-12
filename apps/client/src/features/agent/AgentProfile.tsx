/**
 * AgentProfile — публичный профиль агента `/agents/[id]` (Task 5, ADR-0140).
 *
 * Server component: данные приходят пропсами из page.tsx (getAgentById +
 * searchListingsPage({ agentId }), API.md §21). Аватар/инициал — тот же
 * паттерн, что у карточки агента на главной (features/home/Agents.tsx).
 * Сетка объявлений реюзает PropertyCard из features/search (card-shape
 * mapListing) — как в /search (SearchResults).
 */
import { useTranslations } from 'next-intl';
import { User } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { PropertyCard } from '@/features/search/PropertyCard';
import type { Agent } from '@/lib/api/agents';
import type { Listing } from '@/lib/mock/types';

/** Первая буква имени для аватара-плейсхолдера (нет имени → null). */
const initial = (name: string | null) =>
  name && name.trim() ? name.trim().charAt(0).toUpperCase() : null;

export interface AgentProfileProps {
  agent: Agent;
  listings: Listing[];
}

export function AgentProfile({ agent, listings }: AgentProfileProps) {
  const t = useTranslations('agentProfile');

  return (
    <div className="mx-auto max-w-[1280px] px-4 py-8 sm:px-6">
      {/* Шапка профиля */}
      <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:items-start sm:text-left">
        <span className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full bg-mint text-2xl font-extrabold text-teal-deep">
          {agent.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={agent.avatarUrl} alt="" className="h-full w-full object-cover" />
          ) : initial(agent.name) ? (
            initial(agent.name)
          ) : (
            <User size={32} strokeWidth={1.9} />
          )}
        </span>
        <div className="min-w-0 flex-1">
          {/* Имя — если null, вообще не выдумываем фолбэк-текст, строка скрыта */}
          {agent.name && <h1 className="text-[24px] font-bold text-ink">{agent.name}</h1>}
          <div className="mt-1 text-[15px] text-muted-foreground">
            {agent.agencyName || t('privateAgent')}
          </div>
          <div className="mt-2 text-[14px] font-semibold text-teal">
            {t('listingsCount', { count: agent.activeListingsCount })}
          </div>
        </div>
      </div>

      {/* О себе — только если заполнено */}
      {agent.about && (
        <div className="mt-6 max-w-[720px]">
          <h2 className="text-[16px] font-bold text-ink">{t('about')}</h2>
          <p className="mt-1.5 whitespace-pre-line text-[14.5px] text-muted-foreground">
            {agent.about}
          </p>
        </div>
      )}

      {/* Сетка объявлений агента — первая страница /search?agent_id=. */}
      <div className="mt-8">
        {listings.length === 0 ? (
          <EmptyState title={t('empty')} />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {listings.map((l) => (
              <PropertyCard key={l.id} listing={l} />
            ))}
          </div>
        )}
      </div>
      {/* TODO: pagination out of scope for this task — рендерим только первую SEARCH_PAGE_SIZE-страницу */}
    </div>
  );
}
