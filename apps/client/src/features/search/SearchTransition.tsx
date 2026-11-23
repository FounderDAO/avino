'use client';

/**
 * SearchTransition — общий useTransition для фильтров и выдачи /search.
 *
 * Раньше скелетон при смене фильтров давал route-level loading.tsx, но он
 * переводит страницу в стриминг: ответ уходит с 200 до рендера, и notFound()
 * (например, ?page= за пределами выдачи) не может вернуть 404. Теперь
 * FilterBar навигирует внутри startTransition, а SearchResults показывает
 * тот же скелетон, пока isPending.
 */
import * as React from 'react';

interface SearchTransitionValue {
  isPending: boolean;
  startTransition: (fn: () => void) => void;
}

const SearchTransitionContext = React.createContext<SearchTransitionValue>({
  isPending: false,
  startTransition: (fn) => fn(),
});

export function SearchTransitionProvider({ children }: { children: React.ReactNode }) {
  const [isPending, startTransition] = React.useTransition();
  const value = React.useMemo(() => ({ isPending, startTransition }), [isPending]);
  return <SearchTransitionContext.Provider value={value}>{children}</SearchTransitionContext.Provider>;
}

export function useSearchTransition(): SearchTransitionValue {
  return React.useContext(SearchTransitionContext);
}
