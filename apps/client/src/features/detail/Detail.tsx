/**
 * Detail — основной layout страницы объекта.
 * Перенос Detail из claudeDesign/detail.jsx на токены/компоненты проекта.
 *
 * Структура: хлебные крошки/назад → галерея → две колонки (контент + sticky-
 * контакт) → похожие объявления. Server component; интерактив (галерея,
 * лайтбокс, контакт, избранное) — внутри дочерних 'use client'-компонентов.
 */
import { Link } from '@/i18n/navigation';
import { ChevronLeft, MapPin, Check } from 'lucide-react';
import { Gallery } from '@/components/ui/gallery';
import { PromoBadge } from '@/components/ui/promo-badge';
import { SectionTitle } from '@/components/ui/section-title';
import { Button } from '@/components/ui/button';
import { formatPrice, specs, txLabel, propertyTypeLabel } from '@/lib/format';
import { getSimilarListings } from '@/lib/api/listings';
import type { Listing } from '@/lib/mock/types';
import { PropertyCard } from '@/features/search/PropertyCard';
import { Facts } from './Facts';
import { ContactCard } from './ContactCard';

export interface DetailProps {
  listing: Listing;
}

export async function Detail({ listing }: DetailProps) {
  const parts = specs(listing);
  const similar = await getSimilarListings(listing, 4);
  // Ссылка «Назад к поиску» сохраняет тип сделки текущего объекта.
  const backHref = `/search?tx=${listing.tx}`;

  return (
    <div className="fade-up mx-auto max-w-[1280px] px-4 pb-12 pt-5 sm:px-6">
      {/* Назад к поиску */}
      <div className="mb-4">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 text-[14.5px] font-bold text-teal hover:text-teal-deep"
        >
          <ChevronLeft size={18} /> Назад к поиску
        </Link>
      </div>

      {/* Галерея */}
      <Gallery photos={listing.photos} alt={listing.title} />

      {/* Две колонки: контент + sticky-контакт */}
      <div className="mt-7 grid grid-cols-1 items-start gap-8 lg:grid-cols-[1fr_360px]">
        {/* Левая колонка — контент */}
        <div className="min-w-0">
          {/* Бейджи: промо + тип + сделка */}
          <div className="flex flex-wrap items-center gap-2.5">
            <PromoBadge promo={listing.promo} />
            <span className="rounded-badge border border-border bg-surface-2 px-2.5 py-1 text-[12.5px] font-bold text-teal">
              {propertyTypeLabel(listing.type)}
            </span>
            <span className="rounded-badge border border-border bg-surface-2 px-2.5 py-1 text-[12.5px] font-bold">
              {txLabel(listing.tx)}
            </span>
          </div>

          {/* Цена */}
          <div className="display mt-3.5 text-[40px]">{formatPrice(listing)}</div>

          {/* Характеристики строкой */}
          {parts.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center text-[15.5px] font-medium text-muted-foreground">
              {parts.map((p, i) => (
                <span key={i} className="inline-flex items-center">
                  {i > 0 && <span className="mx-2.5 text-border">•</span>}
                  {p}
                </span>
              ))}
            </div>
          )}

          {/* Адрес */}
          <div className="mt-2.5 flex items-center gap-2 text-[15.5px] text-muted-foreground">
            <MapPin size={18} strokeWidth={1.9} className="shrink-0" />
            <span>
              {listing.address}, {listing.district} р-н, Ташкент
            </span>
          </div>

          {/* Ключевые факты */}
          <Facts listing={listing} className="mt-6" />

          {/* Описание */}
          {listing.desc && (
            <div className="mt-8">
              <h2 className="text-[22px]">Описание</h2>
              <p className="mt-2.5 text-base leading-relaxed text-ink-soft">{listing.desc}</p>
            </div>
          )}

          {/* Особенности */}
          {listing.features && listing.features.length > 0 && (
            <div className="mt-7">
              <h2 className="text-[22px]">Особенности</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {listing.features.map((ft) => (
                  <span
                    key={ft}
                    className="inline-flex items-center gap-1.5 rounded-pill border border-border bg-surface px-3.5 py-2 text-sm font-semibold"
                  >
                    <Check size={15} strokeWidth={2.4} className="text-green" /> {ft}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Локация — стилизованная заглушка карты (без Leaflet) */}
          <div className="mt-8">
            <h2 className="text-[22px]">На карте</h2>
            <div className="relative mt-3 h-[280px] overflow-hidden rounded-feature border border-border bg-mint">
              {/* Декоративная сетка-«карта» */}
              <div
                className="absolute inset-0 opacity-60"
                style={{
                  backgroundImage:
                    'linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)',
                  backgroundSize: '40px 40px',
                }}
              />
              {/* Пин по центру */}
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red text-white shadow-card">
                  <MapPin size={24} />
                </div>
                <div className="mt-3 rounded-card bg-surface/90 px-4 py-2 text-sm font-semibold text-ink shadow-card backdrop-blur">
                  {listing.district} р-н · {listing.address}
                </div>
              </div>
            </div>
            <p className="mt-2 text-[13.5px] text-muted-foreground">
              Точное местоположение показывается после связи с автором.
            </p>
          </div>
        </div>

        {/* Правая колонка — sticky-контакт (на мобиле уходит вниз) */}
        <div className="lg:sticky lg:top-[88px]">
          <ContactCard listing={listing} />
        </div>
      </div>

      {/* Похожие объявления */}
      {similar.length > 0 && (
        <div className="mt-12">
          <SectionTitle
            title="Похожие объявления"
            action={
              <Button variant="ghost" asChild className="text-[15px]">
                <Link href={backHref}>Смотреть все</Link>
              </Button>
            }
          />
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {similar.map((s) => (
              <PropertyCard key={s.id} listing={s} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
