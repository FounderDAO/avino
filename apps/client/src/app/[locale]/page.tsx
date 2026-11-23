/**
 * Главная страница Avino (/).
 * Server component: собирает секции и тянет мок-данные синхронно через @/lib/mock.
 * Интерактив (поиск, карусель, FAQ) вынесен в дочерние 'use client' компоненты.
 */
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { alternatesFor } from '@/lib/seo/alternates';
import { BASE } from '@/lib/seo/base';
import {
  getFeaturedListings,
  prioritizePhotos,
  searchListings,
  searchListingsPage,
} from '@/lib/api/listings';
import { getDistricts } from '@/lib/api/geo';
import { getAgents } from '@/lib/api/agents';
import { Hero } from '@/features/home/Hero';
import { Categories } from '@/features/home/Categories';
import { FeaturedCarousel } from '@/features/home/FeaturedCarousel';
import { Districts } from '@/features/home/Districts';
import { Agents } from '@/features/home/Agents';
import { AgentCTA } from '@/features/home/AgentCTA';
import { Faq } from '@/features/home/Faq';
import { HOME_FAQ_KEYS } from '@/features/home/faqKeys';
import { faqNode } from '@/lib/seo/graph';
import { openGraphBase } from '@/lib/seo/og';
import { SiteGraph } from '@/components/seo/SiteGraph';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta' });
  const title = t('title');
  const description = t('description');
  return {
    // Заголовок главной уже начинается с «Avino —»: без шаблона «%s | Avino» из layout.
    title: { absolute: title },
    description,
    alternates: alternatesFor('/', locale),
    openGraph: {
      ...openGraphBase(locale),
      title,
      description,
      url: `${BASE}/${locale}`,
    },
    twitter: { card: 'summary_large_image' },
  };
}

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations('home');
  // Рекомендованные (VIP/TOP в приоритете), свежее в аренде, районы для
  // автокомплита локации в Hero (выбор района → /search?district_id=) и
  // каталог агентов для блока «Агенты» (по числу активных объявлений, §21).
  const [featured, rent, districts, agentsPage, all] = await Promise.all([
    getFeaturedListings(8, locale),
    searchListings({ tx: 'RENT' }, locale),
    getDistricts(locale),
    getAgents(6),
    // Только meta.total — число активных объявлений для вводного абзаца.
    searchListingsPage({}, locale, 1),
  ]);

  // FAQPage — те же вопросы, что рендерит аккордеон Faq (HOME_FAQ_KEYS).
  const faq = faqNode(
    `${BASE}/${locale}`,
    HOME_FAQ_KEYS.map((key) => ({ q: t(`faq.items.${key}.q`), a: t(`faq.items.${key}.a`) })),
  );

  return (
    <div className="fade-up pb-12">
      <SiteGraph nodes={[faq]} page={{ path: '/', nameKey: 'meta.title', aboutOrg: true }} />
      <Hero districts={districts} />
      <Categories />
      {/* Answer-first: что такое Avino и сколько объявлений — из API, не захардкожено. */}
      {all.total > 0 && (
        <section className="mx-auto max-w-[1280px] px-4 pt-8 sm:px-6">
          <p className="max-w-[72ch] text-[15px] leading-relaxed text-muted-foreground">
            {t('intro', { count: all.total })}
          </p>
        </section>
      )}
      <FeaturedCarousel
        title={t('featured.recommended.title')}
        subtitle={t('featured.recommended.subtitle')}
        listings={featured}
      />
      <FeaturedCarousel
        title={t('featured.rent.title')}
        subtitle={t('featured.rent.subtitle')}
        listings={prioritizePhotos(rent)}
      />
      <Districts />
      <Agents agents={agentsPage.agents} total={agentsPage.total} />
      <AgentCTA />
      <Faq />
    </div>
  );
}
