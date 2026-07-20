/**
 * Agents — блок агентов и агентств на главной.
 * Данные приходят пропсами из page.tsx (SSR getAgents(), реальный API §21).
 * Показывает первые несколько карточек; когда агентов больше, чем помещается
 * в блок, справа от заголовка появляется ссылка на полный каталог /agents.
 * Пустой список → блок не рендерится.
 */
import { useTranslations } from 'next-intl';
import { ArrowRight } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { SectionTitle } from '@/components/ui/section-title';
import { AgentCard } from '@/features/agents/AgentCard';
import type { Agent } from '@/lib/api/agents';

export function Agents({ agents, total }: { agents: Agent[]; total: number }) {
  const t = useTranslations('home');

  if (agents.length === 0) return null;

  return (
    <section className="mx-auto max-w-[1280px] px-4 pt-14 sm:px-6">
      <SectionTitle
        title={t('agents.title')}
        subtitle={t('agents.subtitle')}
        action={
          total > agents.length ? (
            <Link
              href="/agents"
              className="flex shrink-0 items-center gap-1 text-sm font-semibold text-teal hover:underline"
            >
              {t('agents.seeAll', { count: total })}
              <ArrowRight size={16} strokeWidth={2.2} />
            </Link>
          ) : undefined
        }
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {agents.map((a) => (
          <AgentCard key={a.id} agent={a} />
        ))}
      </div>
    </section>
  );
}
