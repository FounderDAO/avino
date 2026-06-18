/**
 * MyListings — вкладка «Мои объявления» (реальный API).
 *
 * Источник данных: GET /listings/mine (Bearer) через useGetMyListingsQuery.
 * Возвращает объявления ЛЮБОГО статуса (кроме DELETED). Статус-пилл читает
 * реальный listing_status. Аналитики (просмотры/обращения) API не отдаёт —
 * см. TODO(listing-analytics).
 *
 * Состояния: гость → EmptyState с подсказкой входа; загрузка → скелетон-строки;
 * пусто → EmptyState. «Редактировать» ведёт на /sell/:id/edit (реальная форма
 * редактирования); Продвинуть/В архив — заглушки (вне области задачи).
 */
'use client';

import * as React from 'react';
import { Link } from '@/i18n/navigation';
import { Home } from 'lucide-react';
import type { Listing, ListingStatus } from '@/lib/mock/types';
import { useTranslations } from 'next-intl';
import { formatPrice } from '@/lib/format';
import { PhotoImg } from '@/components/ui/photo-img';
import { PromoBadge } from '@/components/ui/promo-badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { cn } from '@/lib/utils';
import { useAppSelector } from '@/store/hooks';
import { selectIsAuthenticated } from '@/store/slices/authSlice';
import { useGetMyListingsQuery, useSetMyListingStatusMutation } from '@/store/api/myListingsApi';
import {
  ownerActionsFor,
  type OwnerActionDescriptor,
} from './ownerListingActions';

/**
 * Классы цвета для статус-пилла. Покрывает все реальные статусы
 * (NEW|ACTIVE|DRAFT|REJECTED|ARCHIVED|SOLD|RENTED). DELETED API не отдаёт.
 * Подпись — в словаре account.myListings.status.{STATUS}.
 */
const STATUS_META: Record<Exclude<ListingStatus, 'DELETED'>, { cls: string }> = {
  ACTIVE: { cls: 'bg-green-bg text-green' },
  NEW: { cls: 'bg-[#FBF0DE] text-[#C77A12]' },
  DRAFT: { cls: 'bg-mint text-teal' },
  REJECTED: { cls: 'bg-[#FBE0E0] text-[#C0392B]' },
  ARCHIVED: { cls: 'bg-muted text-muted-foreground' },
  SOLD: { cls: 'bg-muted text-muted-foreground' },
  RENTED: { cls: 'bg-muted text-muted-foreground' },
};

function StatusPill({ s }: { s: ListingStatus | undefined }) {
  const t = useTranslations('account');
  const meta = s && s !== 'DELETED' ? STATUS_META[s] : undefined;
  if (!meta || !s) return null;
  return (
    <span
      className={cn('whitespace-nowrap rounded-pill px-[11px] py-1 text-xs font-extrabold', meta.cls)}
    >
      {t(`myListings.status.${s}`)}
    </span>
  );
}

/** Строка объявления в кабинете. */
function ListingRow({ l }: { l: Listing }) {
  const t = useTranslations('account');
  const tUnits = useTranslations('units');
  const [setStatus, { isLoading }] = useSetMyListingStatusMutation();
  const actions = ownerActionsFor(l.status, l.tx);

  const run = (a: OwnerActionDescriptor) => {
    if (a.confirm) {
      const key =
        a.action === 'MARK_SOLD'
          ? 'myListings.actions.confirm.markSold'
          : 'myListings.actions.confirm.markRented';
      if (!window.confirm(t(key))) return;
    }
    void setStatus({ id: l.id, action: a.action });
  };

  return (
    <div className="grid grid-cols-[120px_1fr] items-center gap-4 rounded-card border border-border/60 bg-surface p-3.5 shadow-card sm:grid-cols-[120px_1fr_auto]">
      {/* Превью */}
      <Link
        href={`/listing/${l.id}`}
        className="block h-[84px] w-[120px] overflow-hidden rounded-[10px]"
      >
        <PhotoImg src={l.photos[0]?.thumb ?? ''} alt={l.title} className="h-full w-full" />
      </Link>

      {/* Текстовая часть */}
      <div className="min-w-0">
        <div className="mb-[5px] flex items-center gap-2">
          <StatusPill s={l.status} />
          <PromoBadge promo={l.promo} />
        </div>
        <div className="truncate text-base font-bold">{l.title}</div>
        <div className="mt-[3px] text-[13.5px] text-muted-foreground">
          {formatPrice(l, tUnits)} · {l.district}
        </div>
        {/* TODO(listing-analytics): API /listings/mine не отдаёт views/leads. */}
      </div>

      {/* Действия */}
      <div className="col-span-2 flex flex-wrap gap-2 sm:col-span-1 sm:flex-col">
        <Button asChild variant="outline" size="sm">
          <Link href={`/sell/${l.id}/edit`}>{t('myListings.edit')}</Link>
        </Button>
        {/* Промо-CTA сохраняем как было (стаб вне области задачи). */}
        {l.promo === 'NORMAL' && (
          <Button size="sm" type="button">
            {t('myListings.promote')}
          </Button>
        )}
        {actions.map((a) => (
          <Button
            key={a.action}
            variant={a.variant === 'default' ? 'primary' : 'outline'}
            size="sm"
            type="button"
            disabled={isLoading}
            onClick={() => run(a)}
          >
            {t(`myListings.actions.${a.labelKey}`)}
          </Button>
        ))}
      </div>
    </div>
  );
}

/** Скелетон-строка на время загрузки. */
function SkeletonRow() {
  return (
    <div className="grid grid-cols-[120px_1fr] items-center gap-4 rounded-card border border-border/60 bg-surface p-3.5 shadow-card sm:grid-cols-[120px_1fr_auto]">
      <div className="h-[84px] w-[120px] animate-pulse rounded-[10px] bg-muted" />
      <div className="min-w-0 space-y-2">
        <div className="h-4 w-24 animate-pulse rounded bg-muted" />
        <div className="h-4 w-3/5 animate-pulse rounded bg-muted" />
        <div className="h-3 w-2/5 animate-pulse rounded bg-muted" />
      </div>
    </div>
  );
}

export function MyListings() {
  const t = useTranslations('account');
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const { data, isLoading } = useGetMyListingsQuery(undefined, {
    skip: !isAuthenticated,
  });

  const header = (
    <div className="mb-[18px] flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-[28px]">{t('myListings.title')}</h1>
        {data && (
          <p className="mt-0.5 text-muted-foreground">
            {t('myListings.summary', {
              total: data.total,
              moderation: data.items.filter((l) => l.status === 'NEW').length,
            })}
          </p>
        )}
      </div>
      <Button asChild>
        <Link href="/sell/new">
          <Home size={17} /> {t('myListings.post')}
        </Link>
      </Button>
    </div>
  );

  // Гость — защищённую ручку не дёргаем, показываем подсказку входа.
  if (!isAuthenticated) {
    return (
      <div>
        {header}
        <EmptyState
          icon={Home}
          title={t('myListings.authTitle')}
          text={t('myListings.authText')}
          action={
            <Button asChild>
              <Link href="/">{t('myListings.goHome')}</Link>
            </Button>
          }
        />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div>
        {header}
        <div className="flex flex-col gap-3">
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </div>
      </div>
    );
  }

  const items = data?.items ?? [];

  if (items.length === 0) {
    return (
      <div>
        {header}
        <EmptyState
          icon={Home}
          title={t('myListings.emptyTitle')}
          text={t('myListings.emptyText')}
          action={
            <Button asChild>
              <Link href="/sell/new">
                <Home size={17} /> {t('myListings.post')}
              </Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div>
      {header}
      <div className="flex flex-col gap-3">
        {items.map((l) => (
          <ListingRow key={l.id} l={l} />
        ))}
      </div>
    </div>
  );
}
