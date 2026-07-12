/**
 * Agents — блок агентов и агентств на главной.
 * Данные приходят пропсами из page.tsx (SSR getAgents(), реальный API §21).
 * Карточка — ссылка на /agents/:id; аватар: avatarUrl → фото, иначе инициал-
 * плейсхолдер (как в ProfileMenu). Пустой список → блок не рендерится.
 */
import { useTranslations } from 'next-intl';
import { User } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { SectionTitle } from '@/components/ui/section-title';
import type { Agent } from '@/lib/api/agents';

/** Первая буква имени для аватара-плейсхолдера (нет имени → null). */
const initial = (name: string | null) =>
  name && name.trim() ? name.trim().charAt(0).toUpperCase() : null;

export function Agents({ agents }: { agents: Agent[] }) {
  const t = useTranslations('home');

  if (agents.length === 0) return null;

  return (
    <section className="mx-auto max-w-[1280px] px-4 pt-14 sm:px-6">
      <SectionTitle
        title={t('agents.title')}
        subtitle={t('agents.subtitle')}
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {agents.map((a) => (
          <Link
            key={a.id}
            href={`/agents/${a.id}`}
            className="flex items-center gap-3.5 rounded-card border border-border/60 bg-surface p-4 shadow-card transition-shadow duration-200 hover:shadow-card-hover"
          >
            {/* Аватар: фото, инициал или иконка-плейсхолдер */}
            <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-mint text-lg font-extrabold text-teal-deep">
              {a.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : initial(a.name) ? (
                initial(a.name)
              ) : (
                <User size={20} strokeWidth={1.9} />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate font-bold text-ink">{a.name}</div>
              {a.agencyName && (
                <div className="mt-0.5 truncate text-[13.5px] text-muted-foreground">
                  {a.agencyName}
                </div>
              )}
              <div className="mt-1.5 text-[13px] font-semibold text-teal">
                {t('agents.listingsCount', { count: a.activeListingsCount })}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
