import { SearchBar } from '@/features/search/SearchBar';

/**
 * Hero (TASK-191) — полноширинная секция главной публичного портала.
 *
 * Крупный двухстрочный заголовок (белый) поверх затемнённого бренд-градиента
 * (без бинарных ассетов — градиент + overlay). Под заголовком центрирован
 * <SearchBar/> (клиентский остров). Серверный компонент. Mobile-responsive:
 * меньший заголовок и полноширинный поиск на узких экранах.
 */

const STRINGS = {
  headingLine1: 'Недвижимость Узбекистана',
  headingLine2: 'в одном месте',
  subtitle: 'Купля, продажа и аренда — тысячи актуальных объявлений',
} as const;

export function Hero() {
  return (
    <section className="relative isolate overflow-hidden">
      {/* Бренд-градиент + затемняющий overlay (без бинарных ассетов). */}
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-gradient-to-br from-primary via-primary/80 to-[#1a1a1a]"
      />
      <div aria-hidden="true" className="absolute inset-0 -z-10 bg-black/30" />

      <div className="mx-auto flex max-w-3xl flex-col items-center gap-6 px-6 py-24 text-center sm:py-32">
        <h1 className="text-3xl font-bold tracking-tight text-white sm:text-5xl">
          {STRINGS.headingLine1}
          <br />
          {STRINGS.headingLine2}
        </h1>
        <p className="max-w-xl text-base text-white/85 sm:text-lg">
          {STRINGS.subtitle}
        </p>
        <div className="w-full max-w-xl">
          <SearchBar />
        </div>
      </div>
    </section>
  );
}
