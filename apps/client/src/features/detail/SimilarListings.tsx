/**
 * SimilarListings — блок «Похожие объявления» на странице объекта.
 *
 * Клиентский компонент (не серверный fetch из Detail): дёргает
 * searchApi.useSimilarListingsQuery, baseQueryWithReauth сам подставляет
 * Bearer зрителя (authSlice, Redux-память) — поэтому серверный блок-лист
 * (спека 2026-08-19 §2) применяется и здесь, без ручной прокидки токена.
 * Тег 'Search' даёт бонус: блокировка/разблокировка пользователя из другой
 * вкладки инвалидирует выдачу и «Похожие» перерисуются сами.
 */
'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { SectionTitle } from '@/components/ui/section-title';
import { Button } from '@/components/ui/button';
import { PropertyCard } from '@/features/search/PropertyCard';
import { PropertyCardSkeleton } from '@/features/search/PropertyCardSkeleton';
import { useSimilarListingsQuery } from '@/store/api/searchApi';
import type { Listing } from '@/lib/mock/types';

export interface SimilarListingsProps {
  listing: Listing;
  /** Ссылка «Смотреть все» — сохраняет тип сделки текущего объекта. */
  backHref: string;
  limit?: number;
}

export function SimilarListings({ listing, backHref, limit = 4 }: SimilarListingsProps) {
  const t = useTranslations('listing');
  const { data, isLoading } = useSimilarListingsQuery({
    tx: listing.tx,
    type: listing.type,
    excludeId: listing.id,
    limit,
  });

  if (isLoading) {
    return (
      <div className="mt-12">
        <SectionTitle title={t('sections.similar')} />
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: limit }).map((_, i) => (
            <PropertyCardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  // Пустая выдача (или ошибка запроса) — секция скрыта целиком, как и раньше.
  if (!data || data.length === 0) return null;

  return (
    <div className="mt-12">
      <SectionTitle
        title={t('sections.similar')}
        action={
          <Button variant="ghost" asChild className="text-[15px]">
            <Link href={backHref}>{t('similar.viewAll')}</Link>
          </Button>
        }
      />
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {data.map((s) => (
          <PropertyCard key={s.id} listing={s} />
        ))}
      </div>
    </div>
  );
}
