'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { useAppSelector } from '@/store/hooks';
import { selectIsAuthenticated } from '@/store/slices/authSlice';
import {
  useGetOutgoingToursQuery,
  useGetIncomingToursQuery,
  useUpdateTourStatusMutation,
  type TourRequestItem,
  type TourAction,
} from '@/store/api/tourRequestsApi';
import { cn } from '@/lib/utils';
import { IncomingTourModal } from './IncomingTourModal';

function StatusBadge({ status }: { status: TourRequestItem['status'] }) {
  const t = useTranslations('account');
  return (
    <span className="rounded-badge bg-mint px-2 py-0.5 text-[11.5px] font-bold text-teal-deep">
      {t(`tours.status.${status}`)}
    </span>
  );
}

/** Класс заливки для цветных действий: CONFIRM — зелёный, DECLINE — красный, иначе обводка. */
function actionClass(action: TourAction): string {
  if (action === 'CONFIRM') return 'bg-green text-white hover:brightness-95';
  if (action === 'DECLINE') return 'bg-red text-white hover:bg-red-press';
  return 'border border-border hover:bg-bg';
}

function Row({
  item,
  actions,
  onOpen,
}: {
  item: TourRequestItem;
  actions: { label: string; action: TourAction }[];
  onOpen?: () => void;
}) {
  const t = useTranslations('account');
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
        'flex items-center justify-between gap-3 rounded-card border border-border bg-surface p-4',
        clickable && 'cursor-pointer hover:border-teal/60',
      )}
    >
      <div className="min-w-0">
        <div className="truncate text-[15px] font-semibold">
          <span>{item.requester_name}</span>
          <span className="text-muted-foreground"> · {item.requester_phone}</span>
        </div>
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
              // Клик по кнопке действия не должен открывать модалку строки.
              e.stopPropagation();
              void update({ id: item.id, action: a.action })
                .unwrap()
                .catch(() => {});
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
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const { data: outgoing } = useGetOutgoingToursQuery(undefined, { skip: !isAuthenticated });
  const { data: incoming } = useGetIncomingToursQuery(undefined, { skip: !isAuthenticated });
  const [selected, setSelected] = React.useState<TourRequestItem | null>(null);

  if (!isAuthenticated) return <p className="text-muted-foreground">{t('tours.guest')}</p>;

  const out = outgoing ?? [];
  const inc = incoming ?? [];
  if (out.length === 0 && inc.length === 0)
    return <p className="text-muted-foreground">{t('tours.empty')}</p>;

  return (
    <div className="flex flex-col gap-6">
      {inc.length > 0 && (
        <section className="flex flex-col gap-2.5">
          <h2 className="text-base font-bold">{t('tours.incoming')}</h2>
          {inc.map((it) => (
            <Row
              key={it.id}
              item={it}
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
        </section>
      )}
      {out.length > 0 && (
        <section className="flex flex-col gap-2.5">
          <h2 className="text-base font-bold">{t('tours.outgoing')}</h2>
          {out.map((it) => (
            <Row
              key={it.id}
              item={it}
              actions={
                it.status === 'PENDING' || it.status === 'CONFIRMED'
                  ? [{ label: t('tours.cancel'), action: 'CANCEL' }]
                  : []
              }
            />
          ))}
        </section>
      )}

      <IncomingTourModal item={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
