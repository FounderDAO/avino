import { Hero } from '@/features/home/Hero';

/**
 * Главная публичного портала (TASK-191).
 *
 * Рендерит hero с поиском. Серверный компонент; клиентский остров — <SearchBar/>
 * внутри <Hero/>. Секции объявлений (TASK-192) и карта (TASK-152) добавятся ниже.
 */
export default function HomePage() {
  return <Hero />;
}
