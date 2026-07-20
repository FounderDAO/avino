/**
 * AgentRow — широкая строка каталога /agents (ADR-0148).
 *
 * Формат «строка списка», а не карточка сетки: агентов немного, а полезного
 * текста (агентство + «о себе») больше, чем влезает в плитку — как в каталоге
 * профессионалов Zillow.
 *
 * Строка НЕ ссылка целиком: внутри две кнопки-действия, а интерактив внутри
 * <a> — невалидный HTML и ломает клавиатурную навигацию. Ссылка — имя агента,
 * подсветка тени всей строки идёт через group-hover.
 */
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import type { Agent } from '@/lib/api/agents';
import { AgentAvatar } from './AgentAvatar';

export function AgentRow({ agent }: { agent: Agent }) {
  const t = useTranslations('agentsCatalog');

  // Имя может быть пустым (профиль не заполнен) — тогда в заголовок идёт
  // агентство, а если и его нет — «Частный маклер».
  const name = agent.name?.trim() || null;
  const title = name || agent.agencyName || t('privateAgent');
  const subtitle = name ? agent.agencyName || t('privateAgent') : null;

  return (
    <article className="group flex flex-col gap-4 rounded-card border border-border/60 bg-surface p-4 shadow-card transition-shadow duration-200 hover:shadow-card-hover sm:flex-row sm:items-center sm:gap-5 sm:p-5">
      <div className="flex min-w-0 flex-1 items-start gap-4 sm:gap-5">
        <AgentAvatar name={agent.name} avatarUrl={agent.avatarUrl} size="lg" />

        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[17px] font-bold text-ink sm:text-[19px]">
            <Link href={`/agents/${agent.id}`} className="hover:underline">
              {title}
            </Link>
          </h2>
          {subtitle && (
            <div className="mt-0.5 truncate text-[14px] text-muted-foreground">
              {subtitle}
            </div>
          )}
          {agent.about && (
            <p className="mt-1.5 line-clamp-2 text-[14px] text-muted-foreground">
              {agent.about}
            </p>
          )}
          <span className="mt-2.5 inline-flex rounded-pill bg-mint px-3 py-1 text-[13px] font-bold text-teal-deep">
            {t('activeListings', { count: agent.activeListingsCount })}
          </span>
        </div>
      </div>

      <div className="flex shrink-0 flex-col gap-2 sm:w-[168px]">
        <Button asChild variant="dark" size="sm" className="w-full">
          <Link href={`/agents/${agent.id}`}>{t('viewProfile')}</Link>
        </Button>
        <Button asChild variant="outline" size="sm" className="w-full">
          <Link href={`/search?agent_id=${agent.id}`}>{t('viewListings')}</Link>
        </Button>
      </div>
    </article>
  );
}
