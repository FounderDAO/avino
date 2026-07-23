/**
 * MyListings — вкладка «Мои объявления» (реальный API).
 *
 * Источник данных: GET /listings/mine (Bearer) через useGetMyListingsQuery.
 * Возвращает объявления ЛЮБОГО статуса (кроме DELETED). Статус-пилл читает
 * реальный listing_status. Просмотры/избранное — `views_count`/`likes_count`
 * (LAST_CHANGED_API.md §1); обращения (лиды) API по-прежнему не отдаёт.
 *
 * Состояния: гость → EmptyState с подсказкой входа; загрузка → скелетон-строки;
 * пусто → EmptyState. Действия карточки: «Редактировать» (→ /sell/:id/edit),
 * премиум-CTA «Продвинуть» (стаб) и меню «⋯» со статус-действиями (Скрыть /
 * Продано / Вернуть в продажу) — компактно, чтобы карточка не разрасталась.
 */
'use client';

import * as React from 'react';
import { Link } from '@/i18n/navigation';
import {
  Eye,
  Phone,
  Heart,
  Home,
  Pencil,
  Sparkles,
  Ellipsis,
  EyeOff,
  RotateCcw,
  CircleCheck,
  type LucideIcon,
} from 'lucide-react';
import type { Listing, ListingStatus } from '@/lib/mock/types';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { usePriceFormatter } from '@/lib/usePriceFormatter';
import { PhotoImg } from '@/components/ui/photo-img';
import { PromoBadge } from '@/components/ui/promo-badge';
import { Button } from '@/components/ui/button';
import {
  Dropdown,
  DropdownTrigger,
  DropdownContent,
  DropdownItem,
} from '@/components/ui/dropdown';
import { EmptyState } from '@/components/ui/empty-state';
import { cn } from '@/lib/utils';
import { useAppSelector } from '@/store/hooks';
import { selectIsAuthenticated } from '@/store/slices/authSlice';
import { useGetMyListingsQuery, useSetMyListingStatusMutation } from '@/store/api/myListingsApi';
import { usePromotionsEnabled } from '@/lib/usePromotionsEnabled';
import { BecomeAgentButton } from './BecomeAgentButton';
import {
  ownerActionsFor,
  type OwnerAction,
  type OwnerActionDescriptor,
} from './ownerListingActions';

/** Иконка-подсказка для пунктов меню статус-действий. */
const ACTION_ICON: Record<OwnerAction, LucideIcon> = {
  HIDE: EyeOff,
  MARK_SOLD: CircleCheck,
  MARK_RENTED: CircleCheck,
  REACTIVATE: RotateCcw,
};

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
function ListingRow({ l, promotionsEnabled }: { l: Listing; promotionsEnabled: boolean }) {
  const t = useTranslations('account');
  const tToasts = useTranslations('toasts');
  const fmt = usePriceFormatter();
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
    // Ошибку тостит apiErrorToastMiddleware (endpoint не в suppress-list).
    void setStatus({ id: l.id, action: a.action })
      .unwrap()
      .then(() => toast.success(tToasts('statusUpdated')))
      .catch(() => {});
  };

  return (
    <div className="grid grid-cols-[120px_1fr] items-center gap-4 rounded-card border border-border/60 bg-surface p-3.5 shadow-card sm:grid-cols-[120px_1fr_auto]">
      {/* Превью */}
      <Link
        href={`/listing/${l.id}`}
        className="relative block h-[84px] w-[120px] overflow-hidden rounded-[10px]"
      >
        <PhotoImg src={l.photos[0]?.thumb ?? ''} alt={l.title} />
      </Link>

      {/* Текстовая часть */}
      <div className="min-w-0">
        <div className="mb-[5px] flex items-center gap-2">
          <StatusPill s={l.status} />
          <PromoBadge promo={l.promo} />
        </div>
        {/* Заголовок карточки — чистый адрес; title («тип, площадь, адрес») — фолбэк для объявлений без адреса. */}
        <div className="truncate text-base font-bold">{l.address || l.title}</div>
        <div className="mt-[3px] text-[13.5px] text-muted-foreground">
          {fmt.price(l)} · {l.district}
        </div>
        {/* Просмотры/избранное (LAST_CHANGED_API.md §1). */}
        {(l.viewsCount != null || l.likesCount != null || l.callsCount != null) && (
          <div className="mt-[3px] flex items-center gap-3 text-[12.5px] text-muted-foreground">
            {l.viewsCount != null && (
              <span
                className="inline-flex items-center gap-1"
                title={t('myListings.stats.views', { count: l.viewsCount })}
              >
                <Eye size={13} strokeWidth={2} /> {l.viewsCount}
              </span>
            )}
            {l.likesCount != null && (
              <span
                className="inline-flex items-center gap-1"
                title={t('myListings.stats.likes', { count: l.likesCount })}
              >
                <Heart size={13} strokeWidth={2} /> {l.likesCount}
              </span>
            )}
            {l.callsCount != null && (
              <span
                className="inline-flex items-center gap-1"
                title={t('myListings.stats.calls', { count: l.callsCount })}
              >
                <Phone size={13} strokeWidth={2} /> {l.callsCount}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Действия: основное (Редактировать) + премиум-CTA + меню статусов «⋯» */}
      <div className="col-span-2 flex flex-wrap items-center gap-2 sm:col-span-1 sm:flex-nowrap sm:justify-end">
        <Button asChild variant="outline" size="sm">
          <Link href={`/sell/${l.id}/edit`}>
            <Pencil size={15} strokeWidth={2.2} />
            {t('myListings.edit')}
          </Link>
        </Button>

        {/* Продвинуть — показывается только если admin включил промо-функцию. */}
        {promotionsEnabled && l.promo === 'NORMAL' && (
          <Button
            size="sm"
            type="button"
            variant="outline"
            className="border-gold/40 bg-gold-bg text-gold hover:border-gold/60 hover:bg-gold/15 hover:text-gold focus-visible:ring-gold/35"
          >
            <Sparkles size={14} strokeWidth={2.4} />
            {t('myListings.promote')}
          </Button>
        )}

        {/* Статус-действия скрыты в компактном меню, чтобы карточка не разрасталась. */}
        {actions.length > 0 && (
          <Dropdown>
            <DropdownTrigger asChild>
              <button
                type="button"
                disabled={isLoading}
                aria-label={t('myListings.actions.more')}
                className="inline-flex size-9 shrink-0 items-center justify-center rounded-pill border-[1.6px] border-border bg-surface text-muted-foreground transition-colors hover:border-ink/25 hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-red/35 disabled:pointer-events-none disabled:opacity-50 data-[state=open]:border-ink/30 data-[state=open]:bg-surface-2 data-[state=open]:text-ink"
              >
                <Ellipsis size={18} />
              </button>
            </DropdownTrigger>
            <DropdownContent align="end" className="min-w-[184px]">
              {actions.map((a) => {
                const Icon = ACTION_ICON[a.action];
                const positive = a.variant === 'default';
                return (
                  <DropdownItem
                    key={a.action}
                    onSelect={() => run(a)}
                    className={positive ? 'text-teal' : undefined}
                  >
                    <span className="flex items-center gap-2.5">
                      <Icon
                        size={15}
                        strokeWidth={2.2}
                        className={positive ? 'text-teal' : 'text-muted-2'}
                      />
                      {t(`myListings.actions.${a.labelKey}`)}
                    </span>
                  </DropdownItem>
                );
              })}
            </DropdownContent>
          </Dropdown>
        )}
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
  const promotionsEnabled = usePromotionsEnabled();
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
      {/* CTA «Стать агентом» живёт здесь, а не в шапке портала: предложение
          адресное и видно тем, кто уже управляет своими объявлениями. */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <BecomeAgentButton size="md" withHintText />
        <Button asChild>
          <Link href="/sell/new">
            <Home size={17} /> {t('myListings.post')}
          </Link>
        </Button>
      </div>
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
          <ListingRow key={l.id} l={l} promotionsEnabled={promotionsEnabled} />
        ))}
      </div>
    </div>
  );
}
