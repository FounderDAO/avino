'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Language } from '@avino/shared';
import { useGetListingQuery } from '@/store/api/listingsApi';
import { Button } from '@/components/ui/button';
import { Gallery } from './Gallery';
import { DetailHeader } from './DetailHeader';
import { FeaturesBlock } from './FeaturesBlock';
import { MiniMap } from './MiniMap';
import { ContactCard } from './ContactCard';
import { SimilarListings } from './SimilarListings';
import { LanguageSwitch } from './LanguageSwitch';

/**
 * Детальная страница объявления (TASK-153) — клиентский остров.
 *
 * Грузит карточку по `id` через RTK Query (`getListing`), владеет выбранным
 * языком перевода (`?lang`, дефолт RU — консистентно с RU-копией портала) и
 * собирает раскладку §4.3: галерея → шапка → двухколоночное тело
 * (описание/удобства/мини-карта слева, sticky-контакт справа) → похожие.
 *
 * Состояния loading / 404 / ошибка обрабатываются gracefully, без падений.
 */

const CONTENT_CLASS = 'mx-auto w-full max-w-6xl px-4 py-8';

export function ListingDetail({ id }: { id: string }) {
  const [lang, setLang] = useState<Language>(Language.RU);
  const { data: listing, isLoading, isError, error } = useGetListingQuery({
    id,
    lang,
  });

  if (isLoading) {
    return (
      <main className={CONTENT_CLASS}>
        <div className="animate-pulse space-y-4" aria-hidden="true">
          <div className="aspect-[16/10] w-full rounded-[22px] bg-muted" />
          <div className="h-10 w-48 rounded bg-muted" />
          <div className="h-4 w-2/3 rounded bg-muted" />
          <div className="h-4 w-1/2 rounded bg-muted" />
        </div>
        <span className="sr-only">Загрузка объявления…</span>
      </main>
    );
  }

  if (isError || !listing) {
    const notFound =
      typeof error === 'object' && error !== null && 'status' in error
        ? (error as { status?: number }).status === 404
        : false;

    return (
      <main className={CONTENT_CLASS}>
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-card p-12 text-center">
          <p className="text-lg font-bold tracking-tight text-foreground">
            {notFound ? 'Объявление не найдено' : 'Не удалось загрузить объявление'}
          </p>
          <p className="text-sm text-muted-foreground">
            {notFound
              ? 'Возможно, оно снято с публикации или удалено.'
              : 'Попробуйте обновить страницу позже.'}
          </p>
          <Button asChild variant="outline" className="rounded-full">
            <Link href="/sale">Вернуться к поиску</Link>
          </Button>
        </div>
      </main>
    );
  }

  return (
    <>
      <main className={CONTENT_CLASS}>
        <div className="mb-4 flex justify-end">
          <LanguageSwitch value={lang} onChange={setLang} />
        </div>

        <Gallery media={listing.media} title={listing.title} />

        <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[1fr_360px]">
          <div className="flex flex-col gap-8">
            <DetailHeader listing={listing} />
            <FeaturesBlock listing={listing} />
            <MiniMap
              latitude={listing.latitude}
              longitude={listing.longitude}
              address={listing.address}
            />
          </div>

          <div className="lg:row-start-1 lg:col-start-2">
            <ContactCard listing={listing} />
          </div>
        </div>

        <div className="mt-12">
          <SimilarListings
            currentId={listing.id}
            propertyType={listing.property_type}
            transactionType={listing.transaction_type}
          />
        </div>
      </main>
    </>
  );
}
