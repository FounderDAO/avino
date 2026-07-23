/**
 * AgentCard — компактная карточка агента (блок агентов на главной).
 *
 * Каталог /agents ушёл с этой карточки на широкие строки (AgentRow, ADR-0148),
 * но главной нужна именно сетка компактных карточек — поэтому компонент живёт.
 * Аватар с его fallback'ами — общий AgentAvatar.
 */
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import type { Agent } from '@/lib/api/agents';
import { AgentAvatar } from './AgentAvatar';

export function AgentCard({ agent }: { agent: Agent }) {
  const t = useTranslations('home');

  return (
    <Link
      href={`/agents/${agent.id}`}
      className="flex items-center gap-3.5 rounded-card border border-border/60 bg-surface p-4 shadow-card transition-shadow duration-200 hover:shadow-card-hover"
    >
      <AgentAvatar name={agent.name} avatarUrl={agent.avatarUrl} />
      <div className="min-w-0 flex-1">
        <div className="truncate font-bold text-ink">{agent.name}</div>
        {agent.agencyName && (
          <div className="mt-0.5 truncate text-[13.5px] text-muted-foreground">
            {agent.agencyName}
          </div>
        )}
        <div className="mt-1.5 text-[13px] font-semibold text-teal">
          {t('agents.listingsCount', { count: agent.activeListingsCount })}
        </div>
      </div>
    </Link>
  );
}
