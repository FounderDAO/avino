/**
 * Главная страница Avino (/).
 * Server component: собирает секции и тянет мок-данные синхронно через @/lib/mock.
 * Интерактив (поиск, карусель, FAQ) вынесен в дочерние 'use client' компоненты.
 */
import { getFeaturedListings, getListings } from '@/lib/mock';
import { Hero } from '@/features/home/Hero';
import { Categories } from '@/features/home/Categories';
import { FeaturedCarousel } from '@/features/home/FeaturedCarousel';
import { Districts } from '@/features/home/Districts';
import { Agents } from '@/features/home/Agents';
import { AgentCTA } from '@/features/home/AgentCTA';
import { Faq } from '@/features/home/Faq';

export default function HomePage() {
  // Рекомендованные (VIP/TOP в приоритете) и свежее в аренде.
  const featured = getFeaturedListings(8);
  const rent = getListings({ tx: 'RENT' });

  return (
    <div className="fade-up pb-12">
      <Hero />
      <Categories />
      <FeaturedCarousel
        title="Рекомендуем"
        subtitle="VIP и TOP объявления в приоритете"
        listings={featured}
      />
      <FeaturedCarousel
        title="Свежее в аренде"
        subtitle="Новые предложения за последние дни"
        listings={rent}
      />
      <Districts />
      <Agents />
      <AgentCTA />
      <Faq />
    </div>
  );
}
