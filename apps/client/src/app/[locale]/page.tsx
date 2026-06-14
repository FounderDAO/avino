/**
 * Главная страница Avino (/).
 * Server component: собирает секции и тянет мок-данные синхронно через @/lib/mock.
 * Интерактив (поиск, карусель, FAQ) вынесен в дочерние 'use client' компоненты.
 */
import { getTranslations } from 'next-intl/server';
import {
  getFeaturedListings,
  prioritizePhotos,
  searchListings,
} from '@/lib/api/listings';
import { getDistricts } from '@/lib/api/geo';
import { Hero } from '@/features/home/Hero';
import { Categories } from '@/features/home/Categories';
import { FeaturedCarousel } from '@/features/home/FeaturedCarousel';
import { Districts } from '@/features/home/Districts';
import { Agents } from '@/features/home/Agents';
import { AgentCTA } from '@/features/home/AgentCTA';
import { Faq } from '@/features/home/Faq';

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations('home');
  // Рекомендованные (VIP/TOP в приоритете), свежее в аренде и районы для
  // автокомплита локации в Hero (выбор района → /search?district_id=).
  const [featured, rent, districts] = await Promise.all([
    getFeaturedListings(8, locale),
    searchListings({ tx: 'RENT' }, locale),
    getDistricts(locale),
  ]);

  return (
    <div className="fade-up pb-12">
      <Hero districts={districts} />
      <Categories />
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
      <Agents />
      <AgentCTA />
      <Faq />
    </div>
  );
}
