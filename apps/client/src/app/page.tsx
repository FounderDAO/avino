import { Hero } from '@/features/home/Hero';
import { HomesCarousel } from '@/features/home/HomesCarousel';
import { ActionTiles } from '@/features/home/ActionTiles';

/**
 * Главная публичного портала (TASK-191, TASK-192).
 *
 * Рендерит hero с поиском, затем секции «Объявления для вас» и плитки
 * сценариев. Серверный компонент; клиентские острова — <SearchBar/> внутри
 * <Hero/> и <HomesCarousel/> (RTK Query). Карта (TASK-152) добавится ниже.
 */
export default function HomePage() {
  return (
    <>
      <Hero />
      <div className="mx-auto max-w-6xl space-y-12 px-6 py-12">
        <HomesCarousel />
        <ActionTiles />
      </div>
    </>
  );
}
