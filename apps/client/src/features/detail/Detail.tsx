/**
 * Detail — основной layout страницы объекта.
 * Перенос Detail из claudeDesign/detail.jsx на токены/компоненты проекта.
 *
 * Структура: хлебные крошки → галерея → две колонки (контент + sticky-
 * контакт) → похожие объявления. Server component; интерактив (галерея,
 * лайтбокс, контакт, избранное) — внутри дочерних 'use client'-компонентов.
 *
 * SEO (ADR-0104): принимает breadcrumb-пропы от page.tsx для видимой крошки,
 * зеркалящей JSON-LD BreadcrumbList.
 */
import { getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import {
  ArrowUpDown,
  Building2,
  Check,
  ChevronLeft,
  ExternalLink,
  Eye,
  Flame,
  Heart,
  MapPin,
  ShieldCheck,
  Snowflake,
  Sofa,
  SquareParking,
  WashingMachine,
  Waves,
  Wifi,
  type LucideIcon,
} from 'lucide-react';
import type { Amenity } from '@/lib/mock/types';
import { Gallery } from '@/components/ui/gallery';
import { PromoBadge } from '@/components/ui/promo-badge';
import { SectionTitle } from '@/components/ui/section-title';
import { Button } from '@/components/ui/button';
import { FavButton } from '@/components/ui/fav-button';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { specs, txLabel, propertyTypeLabel } from '@/lib/format';
import { getSimilarListings } from '@/lib/api/listings';
import type { Listing } from '@/lib/mock/types';
import { PropertyCard } from '@/features/search/PropertyCard';
import { Facts } from './Facts';
import { PriceHistory } from './PriceHistory';
import { ContactCard } from './ContactCard';
import { DetailMap } from './DetailMap';
import { DetailPrice } from './DetailPrice';
import { ShareButton } from './ShareButton';
import { ViewTracker } from './ViewTracker';

/** Иконки удобств (ADR-0111, Zillow Phase 2; POOL — LAST_CHANGED_API.md §1). */
const AMENITY_ICON: Record<Amenity, LucideIcon> = {
  AIR_CONDITIONING: Snowflake,
  FURNITURE: Sofa,
  APPLIANCES: WashingMachine,
  INTERNET: Wifi,
  ELEVATOR: ArrowUpDown,
  BALCONY: Building2,
  HEATING: Flame,
  SECURITY: ShieldCheck,
  POOL: Waves,
};

/** Пропы хлебной крошки — передаются из page.tsx (уже имеет переводы). */
export interface DetailBreadcrumb {
  homeLabel: string;
  txLabel: string;
  txPath: string;
}

export interface DetailProps {
  listing: Listing;
  /** Если не передан — показываем только ссылку «Назад к поиску» (backward-compat). */
  breadcrumb?: DetailBreadcrumb;
  /** Встроенный режим (внутри модалки): без крошки/«Назад»/fade-up, ширину задаёт модалка. */
  embedded?: boolean;
}

export async function Detail({ listing, breadcrumb, embedded }: DetailProps) {
  const locale = await getLocale();
  const t = await getTranslations('listing');
  const tUnits = await getTranslations('units');
  const tEnums = await getTranslations('enums');
  const parts = specs(listing, tUnits);
  const similar = await getSimilarListings(listing, 4, locale);
  // Ссылка «Назад к поиску» сохраняет тип сделки текущего объекта.
  const backHref = `/search?tx=${listing.tx}`;

  // Формируем элементы видимой крошки (зеркалят JSON-LD BreadcrumbList из page.tsx).
  const breadcrumbItems = breadcrumb
    ? [
        { label: breadcrumb.homeLabel, href: '/' },
        { label: breadcrumb.txLabel, href: breadcrumb.txPath },
        // Заголовок объявления скрыт на клиенте (пока не нужен) — крошка
        // заканчивается районом.
        ...(listing.district ? [{ label: listing.district }] : []),
      ]
    : null;

  return (
    <div
      className={
        embedded
          ? 'px-4 pb-10 pt-2 sm:px-6'
          : 'fade-up mx-auto max-w-[1280px] px-4 pb-12 pt-5 sm:px-6'
      }
    >
      {/* Регистрирует просмотр (POST /listings/:id/view, LAST_CHANGED_API.md §2). Без UI. */}
      <ViewTracker id={listing.id} />

      {/* Внутри модалки своя шапка → крошку и «Назад» скрываем; избранное + Share оставляем. */}
      {embedded ? (
        <div className="mb-3 flex justify-end gap-2">
          <FavButton
            listingId={listing.id}
            size={38}
            className="border border-border bg-surface shadow-sm hover:bg-surface-2"
          />
          <ShareButton listing={listing} />
        </div>
      ) : (
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          {breadcrumbItems ? <Breadcrumb items={breadcrumbItems} /> : null}
          <div className="flex items-center gap-3">
            <Link
              href={backHref}
              className="inline-flex items-center gap-1.5 text-[14.5px] font-bold text-teal hover:text-teal-deep"
            >
              <ChevronLeft size={18} /> {t('backToSearch')}
            </Link>
            <FavButton
              listingId={listing.id}
              size={38}
              className="border border-border bg-surface shadow-sm hover:bg-surface-2"
            />
            <ShareButton listing={listing} />
          </div>
        </div>
      )}

      {/* Галерея */}
      <Gallery photos={listing.photos} alt={listing.title} />

      {/* Две колонки: контент + sticky-контакт */}
      <div className="mt-7 grid grid-cols-1 items-start gap-8 lg:grid-cols-[1fr_360px]">
        {/* Левая колонка — контент */}
        <div className="min-w-0">
          {/* Заголовок объявления скрыт на клиенте (пока не нужен);
              h1 остаётся в <title>/OG-метаданных страницы. */}

          {/* Бейджи: промо + тип + сделка */}
          <div className="flex flex-wrap items-center gap-2.5">
            <PromoBadge promo={listing.promo} />
            <span className="rounded-badge border border-border bg-surface-2 px-2.5 py-1 text-[12.5px] font-bold text-teal">
              {propertyTypeLabel(listing.type, tEnums)}
            </span>
            <span className="rounded-badge border border-border bg-surface-2 px-2.5 py-1 text-[12.5px] font-bold">
              {txLabel(listing.tx, tEnums)}
            </span>
            {/* Счётчики просмотров/избранного (LAST_CHANGED_API.md §1) — ненавязчиво. */}
            {(listing.viewsCount != null || listing.likesCount != null) && (
              <span className="ml-auto flex items-center gap-3 text-[13px] text-muted-foreground">
                {listing.viewsCount != null && (
                  <span
                    className="inline-flex items-center gap-1"
                    title={t('stats.viewsAria', { count: listing.viewsCount })}
                  >
                    <Eye size={14} strokeWidth={1.9} /> {listing.viewsCount}
                  </span>
                )}
                {listing.likesCount != null && (
                  <span
                    className="inline-flex items-center gap-1"
                    title={t('stats.likesAria', { count: listing.likesCount })}
                  >
                    <Heart size={14} strokeWidth={1.9} /> {listing.likesCount}
                  </span>
                )}
              </span>
            )}
          </div>

          {/* Цена */}
          <DetailPrice listing={listing} />

          {/* Характеристики строкой */}
          {parts.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center text-[15.5px] font-medium text-muted-foreground">
              {parts.map((p, i) => (
                <span key={i} className="inline-flex items-center">
                  {i > 0 && <span className="mx-2.5 text-border">|</span>}
                  {p}
                </span>
              ))}
            </div>
          )}

          {/* Адрес */}
          <div className="mt-2.5 flex items-center gap-2 text-[15.5px] text-muted-foreground">
            <MapPin size={18} strokeWidth={1.9} className="shrink-0" />
            <span>
              {t('addressLine', { address: listing.address, district: listing.district })}
            </span>
          </div>

          {/* Ключевые факты */}
          <Facts listing={listing} className="mt-6" />

          {/* История цены (ADR-0121) */}
          <PriceHistory listing={listing} />

          {/* Описание */}
          {listing.desc && (
            <div className="mt-8">
              <h2 className="text-[22px]">{t('sections.description')}</h2>
              <p className="mt-2.5 text-base leading-relaxed text-ink-soft">{listing.desc}</p>
            </div>
          )}

          {/* Особенности */}
          {listing.features && listing.features.length > 0 && (
            <div className="mt-7">
              <h2 className="text-[22px]">{t('sections.features')}</h2>
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

          {/* Удобства (ADR-0111). Парковка любого типа показывается здесь чипом. */}
          {((listing.amenities && listing.amenities.length > 0) ||
            !!listing.parkingType) && (
            <div className="mt-7">
              <h2 className="text-[22px]">{t('amenities.title')}</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {listing.amenities?.map((a) => {
                  const Icon = AMENITY_ICON[a];
                  return (
                    <span
                      key={a}
                      className="inline-flex items-center gap-1.5 rounded-pill border border-border bg-surface px-3.5 py-2 text-sm font-semibold"
                    >
                      <Icon size={15} strokeWidth={2} className="text-teal" />
                      {tEnums(`amenities.${a}`)}
                    </span>
                  );
                })}
                {listing.parkingType && (
                  <span
                    key="parking"
                    className="inline-flex items-center gap-1.5 rounded-pill border border-border bg-surface px-3.5 py-2 text-sm font-semibold"
                  >
                    <SquareParking size={15} strokeWidth={2} className="text-teal" />
                    {tEnums(`parking.${listing.parkingType}`)}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Локация — настоящая карта Яндекса с одним пином (TASK-196) */}
          <div className="mt-8">
            <h2 className="text-[22px]">{t('sections.map')}</h2>
            {listing.lat != null && listing.lng != null ? (
              <>
                <div className="mt-3 h-[280px] overflow-hidden rounded-feature border border-border">
                  <DetailMap listing={listing} />
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[13.5px] text-muted-foreground">{t('map.note')}</p>
                  {/* Точный пин во внешних Яндекс.Картах (pt=lng,lat). Встроенный
                      линк Яндекса открывает вид без пина — даём свой, управляемый. */}
                  <a
                    href={`https://yandex.uz/maps/?ll=${listing.lng},${listing.lat}&z=17&pt=${listing.lng},${listing.lat},pm2rdm`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-[14px] font-bold text-teal hover:text-teal-deep"
                  >
                    <MapPin size={16} strokeWidth={2} />
                    {t('map.openInYandex')}
                    <ExternalLink size={14} strokeWidth={2} />
                  </a>
                </div>
              </>
            ) : (
              /* Нет координат → аккуратный fallback, без клетчатой заглушки. */
              <div className="mt-3 flex h-[160px] flex-col items-center justify-center gap-2.5 rounded-feature border border-border bg-surface-2 px-6 text-center text-muted-foreground">
                <MapPin size={26} strokeWidth={1.8} className="shrink-0" />
                <span className="text-sm font-medium">{t('map.note')}</span>
              </div>
            )}
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
            title={t('sections.similar')}
            action={
              <Button variant="ghost" asChild className="text-[15px]">
                <Link href={backHref}>{t('similar.viewAll')}</Link>
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
