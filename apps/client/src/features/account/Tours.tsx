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

function StatusBadge({ status }: { status: TourRequestItem['status'] }) {
  const t = useTranslations('account');
  return (
    <span className="rounded-badge bg-mint px-2 py-0.5 text-[11.5px] font-bold text-teal-deep">
      {t(`tours.status.${status}`)}
    </span>
  );
}

function Row({
  item,
  actions,
}: {
  item: TourRequestItem;
  actions: { label: string; action: TourAction }[];
}) {
  const t = useTranslations('account');
  const [update, { isLoading }] = useUpdateTourStatusMutation();
  return (
    <div className="flex items-center justify-between gap-3 rounded-card border border-border bg-surface p-4">
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
            onClick={() => {
              void update({ id: item.id, action: a.action })
                .unwrap()
                .catch(() => {});
            }}
            className="rounded-pill border border-border px-3 py-1.5 text-[13px] font-semibold hover:bg-bg"
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
    </div>
  );
}
