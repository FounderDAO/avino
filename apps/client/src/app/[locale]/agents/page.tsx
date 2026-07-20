/**
 * Публичный каталог агентов /agents (API.md §21, ADR-0140, редизайн ADR-0148).
 *
 * Server component: SSR отдаёт каталог целиком (AGENTS_CATALOG_LIMIT = 100,
 * максимум API) + total — клиентские поиск и сортировка в AgentsCatalog должны
 * видеть весь каталог. Если агентов вдруг больше лимита, остаток дотягивает
 * кнопка «Показать ещё». Пустой каталог не 404-ит — показываем сообщение
 * (агентов может ещё не быть).
 */
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { getAgents, AGENTS_CATALOG_LIMIT } from '@/lib/api/agents';
import { AgentsCatalog } from '@/features/agents/AgentsCatalog';
import { alternatesFor } from '@/lib/seo/alternates';

/**
 * Каталог рендерится на запрос, а не пререндерится на билде: в Docker-сборке
 * API недоступен, getAgents деградирует до пустой страницы, и каталог запёкся
 * бы пустым до первой ревалидации (те же грабли, что у визарда регионов, #258).
 * Данные при этом остаются в fetch-кэше на час (revalidate в getAgents).
 */
export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'agentsCatalog' });

  return {
    title: t('meta.title'),
    description: t('meta.description'),
    alternates: alternatesFor('/agents'),
  };
}

export default async function AgentsPage() {
  const { agents, total } = await getAgents(AGENTS_CATALOG_LIMIT);
  const t = await getTranslations('agentsCatalog');

  return (
    <div className="fade-up mx-auto max-w-[1280px] px-4 pb-12 pt-8 sm:px-6">
      {/* Hero каталога: заголовок + счётчик; панель управления — в AgentsCatalog. */}
      <div className="mb-6">
        <h1 className="text-[26px] font-bold tracking-[-0.02em] text-ink sm:text-[32px]">
          {t('title')}
        </h1>
        <p className="mt-1.5 text-[15px] text-muted-foreground">
          {t('subtitle', { count: total })}
        </p>
      </div>
      <AgentsCatalog initialAgents={agents} total={total} />
    </div>
  );
}
