'use client';

import { DealType, PropertyType } from '@avino/shared';
import { PropertyCard } from '@/features/search/PropertyCard';
import { useSearchListingsQuery } from '@/store/api/searchApi';

/**
 * Похожие объявления (TASK-153, дизайн-спек §4.3).
 *
 * Переиспользует `searchApi` (`GET /api/v1/search`) с тем же типом сделки и
 * недвижимости — отдельного «similar»-эндпоинта в MVP нет (CLAUDE.md §4: только
 * RTK Query, без fetch/axios). Текущий листинг исключаем на клиенте; при пустой
 * или ошибочной выдаче секция не рендерится (graceful).
 */

const SIMILAR_FETCH_LIMIT = 7;
const SIMILAR_SHOW = 6;

export function SimilarListings({
  currentId,
  propertyType,
  transactionType,
}: {
  currentId: string;
  propertyType: PropertyType;
  transactionType: DealType;
}) {
  const { data, isLoading, isError } = useSearchListingsQuery({
    property_type: propertyType,
    transaction_type: transactionType,
    limit: SIMILAR_FETCH_LIMIT,
  });

  if (isLoading || isError) return null;

  const listings = (data?.data ?? [])
    .filter((l) => l.id !== currentId)
    .slice(0, SIMILAR_SHOW);

  if (listings.length === 0) return null;

  return (
    <section aria-labelledby="similar-listings-title" className="flex flex-col gap-4">
      <h2
        id="similar-listings-title"
        className="text-2xl font-bold tracking-tight text-foreground"
      >
        Похожие объявления
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {listings.map((listing) => (
          <PropertyCard key={listing.id} listing={listing} />
        ))}
      </div>
    </section>
  );
}
