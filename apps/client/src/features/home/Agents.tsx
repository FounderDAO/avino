/**
 * Agents — блок агентов и агентств Avino Pro.
 * Данные из getAgents(); карточки с инициалом-аватаром, именем, агентством
 * и счётчиком объявлений. Server component (статичные данные).
 */
import { BadgeCheck } from 'lucide-react';
import { SectionTitle } from '@/components/ui/section-title';
import { getAgents } from '@/lib/mock';

/** Первая буква имени для аватара-плейсхолдера. */
const initial = (name: string) => name.trim().charAt(0).toUpperCase();

export function Agents() {
  const agents = getAgents();

  return (
    <section className="mx-auto max-w-[1280px] px-4 pt-14 sm:px-6">
      <SectionTitle
        title="Агенты и агентства"
        subtitle="Проверенные профессионалы Avino Pro"
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {agents.map((a) => (
          <div
            key={a.id}
            className="flex items-center gap-3.5 rounded-card border border-border/60 bg-surface p-4 shadow-card transition-shadow duration-200 hover:shadow-card-hover"
          >
            {/* Аватар-инициал */}
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-mint text-lg font-extrabold text-teal-deep">
              {initial(a.name)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate font-bold text-ink">{a.name}</span>
                {a.pro && (
                  <BadgeCheck size={16} className="shrink-0 text-teal" aria-label="Avino Pro" />
                )}
              </div>
              <div className="mt-0.5 truncate text-[13.5px] text-muted-foreground">
                {a.agency}
              </div>
              <div className="mt-1.5 text-[13px] font-semibold text-teal">
                {a.listingsCount} объявлений
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
