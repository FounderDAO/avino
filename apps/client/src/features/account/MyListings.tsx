/**
 * MyListings — вкладка «Мои объявления» (мок).
 * Берём несколько листингов из getListings, навешиваем статусы и счётчики,
 * показываем строкой со статус-пиллом, промо-бейджем и действиями-заглушками.
 */
'use client';

import * as React from 'react';
import Link from 'next/link';
import { Home, Eye, Mail } from 'lucide-react';
import { getListings } from '@/lib/mock';
import type { Listing } from '@/lib/mock/types';
import { formatPrice } from '@/lib/format';
import { PhotoImg } from '@/components/ui/photo-img';
import { PromoBadge } from '@/components/ui/promo-badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** Мок-статус объявления в кабинете. */
type MyStatus = 'ACTIVE' | 'NEW' | 'DRAFT';

/** Подпись + классы цвета для статус-пилла. */
const STATUS_META: Record<MyStatus, { label: string; cls: string }> = {
  ACTIVE: { label: 'Активно', cls: 'bg-green-bg text-green' },
  NEW: { label: 'На модерации', cls: 'bg-[#FBF0DE] text-[#C77A12]' },
  DRAFT: { label: 'Черновик', cls: 'bg-mint text-teal' },
};

function StatusPill({ s }: { s: MyStatus }) {
  const { label, cls } = STATUS_META[s];
  return (
    <span
      className={cn('whitespace-nowrap rounded-pill px-[11px] py-1 text-xs font-extrabold', cls)}
    >
      {label}
    </span>
  );
}

/** Расширенный листинг с мок-полями кабинета. */
interface MyListing extends Listing {
  myStatus: MyStatus;
  views: number;
  leads: number;
}

// Мок «мои объявления»: первые 4 листинга + искусственные статусы/метрики
const STATUSES: MyStatus[] = ['ACTIVE', 'NEW', 'ACTIVE', 'DRAFT'];
const VIEWS = [342, 0, 1280, 0];
const LEADS = [8, 0, 23, 0];

const MY: MyListing[] = getListings()
  .slice(0, 4)
  .map((l, i) => ({
    ...l,
    myStatus: STATUSES[i] ?? 'ACTIVE',
    views: VIEWS[i] ?? 0,
    leads: LEADS[i] ?? 0,
  }));

export function MyListings() {
  const moderating = MY.filter((l) => l.myStatus === 'NEW').length;

  return (
    <div>
      <div className="mb-[18px] flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[28px]">Мои объявления</h1>
          <p className="mt-0.5 text-muted-foreground">
            {MY.length} объявления · {moderating} на модерации
          </p>
        </div>
        <Button asChild>
          <Link href="/sell/new">
            <Home size={17} /> Разместить
          </Link>
        </Button>
      </div>

      <div className="flex flex-col gap-3">
        {MY.map((l) => (
          <div
            key={l.id}
            className="grid grid-cols-[120px_1fr] items-center gap-4 rounded-card border border-border/60 bg-surface p-3.5 shadow-card sm:grid-cols-[120px_1fr_auto]"
          >
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
                <StatusPill s={l.myStatus} />
                <PromoBadge promo={l.promo} />
              </div>
              <div className="truncate text-base font-bold">{l.title}</div>
              <div className="mt-[3px] text-[13.5px] text-muted-foreground">
                {formatPrice(l)} · {l.district}
              </div>
              <div className="mt-[7px] flex gap-4 text-[12.5px] text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Eye size={14} strokeWidth={1.9} /> {l.views} просмотров
                </span>
                <span className="inline-flex items-center gap-1">
                  <Mail size={14} strokeWidth={1.9} /> {l.leads} обращений
                </span>
              </div>
            </div>

            {/* Действия (заглушки) */}
            <div className="col-span-2 flex gap-2 sm:col-span-1 sm:flex-col">
              <Button asChild variant="outline" size="sm">
                <Link href="/sell/new">Редактировать</Link>
              </Button>
              {l.promo === 'NORMAL' ? (
                <Button size="sm" type="button">
                  Продвинуть
                </Button>
              ) : (
                <Button variant="outline" size="sm" type="button">
                  В архив
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
