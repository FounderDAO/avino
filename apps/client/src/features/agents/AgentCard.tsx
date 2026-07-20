/**
 * AgentCard — карточка агента каталога (главная + страница /agents).
 *
 * Аватар: avatarUrl → фото, иначе инициал-плейсхолдер (как в ProfileMenu),
 * иначе иконка. Вынесена из features/home/Agents.tsx, когда каталог получил
 * собственную страницу и та же карточка понадобилась в двух местах.
 */
import { useTranslations } from 'next-intl';
import { User } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import type { Agent } from '@/lib/api/agents';

/** Первая буква имени для аватара-плейсхолдера (нет имени → null). */
const initial = (name: string | null) =>
  name && name.trim() ? name.trim().charAt(0).toUpperCase() : null;

export function AgentCard({ agent }: { agent: Agent }) {
  const t = useTranslations('home');

  return (
    <Link
      href={`/agents/${agent.id}`}
      className="flex items-center gap-3.5 rounded-card border border-border/60 bg-surface p-4 shadow-card transition-shadow duration-200 hover:shadow-card-hover"
    >
      {/* Аватар: фото, инициал или иконка-плейсхолдер */}
      <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-mint text-lg font-extrabold text-teal-deep">
        {agent.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={agent.avatarUrl} alt="" className="h-full w-full object-cover" />
        ) : initial(agent.name) ? (
          initial(agent.name)
        ) : (
          <User size={20} strokeWidth={1.9} />
        )}
      </span>
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
