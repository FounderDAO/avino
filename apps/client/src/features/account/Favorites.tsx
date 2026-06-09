/**
 * Favorites — вкладка «Избранное».
 * Берём id из стора (useFavorites) → getListingsByIds → сетка PropertyCard.
 * Пусто → EmptyState со ссылкой на поиск.
 */
'use client';

import * as React from 'react';
import Link from 'next/link';
import { Heart } from 'lucide-react';
import { useFavorites } from '@/store/favorites';
import { getListingsByIds } from '@/lib/mock';
import { PropertyCard } from '@/features/search/PropertyCard';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';

export function Favorites() {
  const ids = useFavorites();
  const items = getListingsByIds(ids);

  return (
    <div>
      <h1 className="mb-[18px] text-[28px]">
        Избранное{' '}
        <span className="text-lg font-semibold text-muted-foreground">· {items.length}</span>
      </h1>

      {items.length === 0 ? (
        <EmptyState
          icon={Heart}
          title="Здесь пока пусто"
          text="Сохраняйте понравившиеся объявления — нажимайте на сердечко в карточках, чтобы вернуться к ним позже."
          action={
            <Button asChild>
              <Link href="/search">Начать поиск</Link>
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((l) => (
            <PropertyCard key={l.id} listing={l} />
          ))}
        </div>
      )}
    </div>
  );
}
