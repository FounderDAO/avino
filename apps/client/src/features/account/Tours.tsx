'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { useAppSelector } from '@/store/hooks';
import { selectIsAuthenticated } from '@/store/slices/authSlice';
import {
  useGetOutgoingToursQuery,
  useGetIncomingToursQuery,
  useGetOutgoingToursPageInfiniteQuery,
  useGetIncomingToursPageInfiniteQuery,
  useUpdateTourStatusMutation,
  type TourRequestItem,
  type TourAction,
} from '@/store/api/tourRequestsApi';
import { cn } from '@/lib/utils';
import { useRouter } from '@/i18n/navigation';
import { PhotoImg } from '@/components/ui/photo-img';
import { NavbarTabs, type NavbarTabItem } from '@/components/ui/navbar-tabs';
import { IncomingTourModal } from './IncomingTourModal';
import { UpcomingTourCard } from './UpcomingTourCard';
import { mergeUpcoming } from './tour-agenda';

type TourTab = 'upcoming' | 'incoming' | 'outgoing';

const UPCOMING_PARAMS = { status: 'CONFIRMED', upcoming: true } as const;

function StatusBadge({ status }: { status: TourRequestItem['status'] }) {
  const t = useTranslations('account');
  return (
    <span className="rounded-badge bg-mint px-2 py-0.5 text-[11.5px] font-bold text-teal-deep">
      {t(`tours.status.${status}`)}
    </span>
  );
}

/** Ключ success-тоста (`toasts.*`) по действию над туром. */
export function tourToastKey(action: TourAction): string {
  if (action === 'CONFIRM') return 'tourConfirmed';
  if (action === 'DECLINE') return 'tourDeclined';
  return 'tourCancelled';
}

/** Класс заливки для цветных действий: CONFIRM — зелёный, DECLINE — красный, иначе обводка. */
function actionClass(action: TourAction): string {
  if (action === 'CONFIRM') return 'bg-green text-white hover:brightness-95';
  if (action === 'DECLINE') return 'bg-red text-white hover:bg-red-press';
  return 'border border-border hover:bg-bg';
}

/** Кнопка cursor-пагинации: рендерится только когда есть следующая страница. */
function LoadMoreButton({
  hasMore,
  loading,
  onClick,
  label,
  loadingLabel,
}: {
  hasMore: boolean;
  loading: boolean;
  onClick: () => void;
  label: string;
  loadingLabel: string;
}) {
  if (!hasMore) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="mt-1 self-center rounded-pill border-[1.5px] border-border px-5 py-2 text-sm font-semibold text-ink transition-colors hover:border-ink disabled:opacity-50"
    >
      {loading ? loadingLabel : label}
    </button>
  );
}

function Row({
  item,
  kind,
  actions,
  onOpen,
}: {
  item: TourRequestItem;
  /** incoming — первая строка про гостя; outgoing — про объявление. */
  kind: 'incoming' | 'outgoing';
  actions: { label: string; action: TourAction }[];
  onOpen?: () => void;
}) {
  const t = useTranslations('account');
  const tToasts = useTranslations('toasts');
  const [update, { isLoading }] = useUpdateTourStatusMutation();
  const clickable = Boolean(onOpen);
  return (
    <div
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={onOpen}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onOpen?.();
              }
            }
          : undefined
      }
      className={cn(
        'flex items-center gap-3 rounded-card border border-border bg-surface p-4',
        clickable && 'cursor-pointer hover:border-teal/60',
      )}
    >
      {/* item.listing может отсутствовать в окне рассинхрона деплоя (клиент раньше API #312) — страховка, не меняет контракт типов */}
      <div className="relative h-[56px] w-[76px] shrink-0 overflow-hidden rounded-[10px]">
        <PhotoImg src={item.listing?.photo_url ?? ''} alt={item.listing?.title ?? ''} sizes="76px" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-semibold">
          {kind === 'incoming' ? (
            <>
              <span>{item.requester_name}</span>
              <span className="text-muted-foreground"> · {item.requester_phone}</span>
            </>
          ) : (
            item.listing?.title ?? ''
          )}
        </div>
        {kind === 'incoming' && (
          <div className="truncate text-[13px]">{item.listing?.title ?? ''}</div>
        )}
        <div className="text-[13px] text-muted-foreground">
          {item.requested_date} {t('tours.on')} {item.window_start}–{item.window_end}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <StatusBadge status={item.status} />
        {actions.map((a) => (
          <button
            key={a.action}
            type="button"
            disabled={isLoading}
            onClick={(e) => {
              // Клик по кнопке действия не должен открывать модалку/переход строки.
              e.stopPropagation();
              // updateTourStatus в suppress-list middleware — тостим вручную.
              void update({ id: item.id, action: a.action })
                .unwrap()
                .then(() => toast.success(tToasts(tourToastKey(a.action))))
                .catch(() => toast.error(tToasts('tourActionFailed')));
            }}
            className={cn(
              'rounded-pill px-3 py-1.5 text-[13px] font-semibold disabled:opacity-50',
              actionClass(a.action),
            )}
          >
            {a.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function Tours() {
  const t = useTranslations('account');
  const router = useRouter();
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const [tab, setTab] = React.useState<TourTab>('upcoming');
  const [selected, setSelected] = React.useState<TourRequestItem | null>(null);

  // Агенда предстоящих (CONFIRMED + upcoming) — массив-хуки, без пагинации.
  const { data: upcomingOut } = useGetOutgoingToursQuery(UPCOMING_PARAMS, { skip: !isAuthenticated });
  const { data: upcomingIn } = useGetIncomingToursQuery(UPCOMING_PARAMS, { skip: !isAuthenticated });
  const upcoming = React.useMemo(
    () => mergeUpcoming(upcomingIn, upcomingOut),
    [upcomingIn, upcomingOut],
  );

  // Заявки — cursor-пагинация «Показать ещё».
  const incomingQ = useGetIncomingToursPageInfiniteQuery(undefined, { skip: !isAuthenticated });
  const outgoingQ = useGetOutgoingToursPageInfiniteQuery(undefined, { skip: !isAuthenticated });
  const inc = React.useMemo(
    () => incomingQ.data?.pages.flatMap((p) => p.items) ?? [],
    [incomingQ.data],
  );
  const out = React.useMemo(
    () => outgoingQ.data?.pages.flatMap((p) => p.items) ?? [],
    [outgoingQ.data],
  );
  const incomingPending = React.useMemo(
    () => inc.filter((i) => i.status === 'PENDING').length,
    [inc],
  );

  if (!isAuthenticated) return <p className="text-muted-foreground">{t('tours.guest')}</p>;

  const tabs: NavbarTabItem<TourTab>[] = [
    { value: 'upcoming', label: t('tours.upcoming') },
    { value: 'incoming', label: t('tours.incoming'), badge: incomingPending },
    { value: 'outgoing', label: t('tours.outgoing') },
  ];

  return (
    <div className="flex flex-col gap-5">
      <NavbarTabs tabs={tabs} value={tab} onChange={setTab} />

      {tab === 'upcoming' &&
        (upcoming.length === 0 ? (
          <p className="text-muted-foreground">{t('tours.emptyUpcoming')}</p>
        ) : (
          <section className="flex flex-col gap-2.5">
            {upcoming.map((entry) => (
              <UpcomingTourCard key={`${entry.role}-${entry.item.id}`} item={entry.item} role={entry.role} />
            ))}
          </section>
        ))}

      {tab === 'incoming' &&
        (inc.length === 0 ? (
          <p className="text-muted-foreground">{t('tours.empty')}</p>
        ) : (
          <section className="flex flex-col gap-2.5">
            {inc.map((it) => (
              <Row
                key={it.id}
                item={it}
                kind="incoming"
                onOpen={() => setSelected(it)}
                actions={
                  it.status === 'PENDING'
                    ? [
                        { label: t('tours.confirm'), action: 'CONFIRM' },
                        { label: t('tours.decline'), action: 'DECLINE' },
                      ]
                    : []
                }
              />
            ))}
            <LoadMoreButton
              hasMore={Boolean(incomingQ.hasNextPage)}
              loading={incomingQ.isFetchingNextPage}
              onClick={() => incomingQ.fetchNextPage()}
              label={t('tours.loadMore')}
              loadingLabel={t('tours.loadingMore')}
            />
          </section>
        ))}

      {tab === 'outgoing' &&
        (out.length === 0 ? (
          <p className="text-muted-foreground">{t('tours.emptyOutgoing')}</p>
        ) : (
          <section className="flex flex-col gap-2.5">
            {out.map((it) => (
              <Row
                key={it.id}
                item={it}
                kind="outgoing"
                onOpen={it.listing?.id ? () => router.push(`/listing/${it.listing.id}`) : undefined}
                actions={
                  it.status === 'PENDING' || it.status === 'CONFIRMED'
                    ? [{ label: t('tours.cancel'), action: 'CANCEL' }]
                    : []
                }
              />
            ))}
            <LoadMoreButton
              hasMore={Boolean(outgoingQ.hasNextPage)}
              loading={outgoingQ.isFetchingNextPage}
              onClick={() => outgoingQ.fetchNextPage()}
              label={t('tours.loadMore')}
              loadingLabel={t('tours.loadingMore')}
            />
          </section>
        ))}

      <IncomingTourModal item={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
