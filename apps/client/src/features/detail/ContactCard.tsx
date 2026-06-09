/**
 * ContactCard — карточка контакта автора объявления (sticky-сайдбар detail).
 * Перенос ContactCard из claudeDesign/detail.jsx на токены проекта.
 * Кнопки: «Показать телефон» (раскрывает номер из мока), «Написать» (заглушка),
 * «В избранное» (FavButton), «Поделиться» (заглушка через navigator.share).
 */
'use client';

import * as React from 'react';
import { MessageSquare, Phone, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FavButton } from '@/components/ui/fav-button';
import type { Listing } from '@/lib/mock/types';

export interface ContactCardProps {
  listing: Listing;
  className?: string;
}

export function ContactCard({ listing, className }: ContactCardProps) {
  const { agent } = listing;
  // Раскрытие телефона по клику (как в прототипе — номер из мока).
  const [phoneShown, setPhoneShown] = React.useState(false);

  // Заглушка «Поделиться»: системный шэр, иначе копируем ссылку.
  const handleShare = React.useCallback(() => {
    if (typeof window === 'undefined') return;
    const url = window.location.href;
    if (navigator.share) {
      void navigator.share({ title: listing.title, url }).catch(() => {});
    } else {
      void navigator.clipboard?.writeText(url).catch(() => {});
    }
  }, [listing.title]);

  return (
    <div className={'rounded-card border border-border bg-surface p-5 shadow-card ' + (className ?? '')}>
      {/* Шапка: аватар-инициал + имя + статус */}
      <div className="flex items-center gap-3">
        <div className="flex h-[50px] w-[50px] shrink-0 items-center justify-center rounded-full bg-mint text-[19px] font-extrabold text-teal-deep">
          {agent.name[0]}
        </div>
        <div className="min-w-0">
          <div className="truncate text-base font-bold">{agent.name}</div>
          <div className="mt-0.5">
            {agent.pro ? (
              <span className="inline-block rounded-badge bg-mint px-2.5 py-1 text-[11.5px] font-extrabold text-teal-deep">
                Avino Pro
              </span>
            ) : (
              <span className="text-[13px] text-muted-foreground">Собственник</span>
            )}
          </div>
        </div>
      </div>

      {/* Кнопки связи */}
      <div className="mt-5 flex flex-col gap-2.5">
        {/* «Показать телефон» раскрывает номер; «Написать» — заглушка */}
        {phoneShown && agent.phone ? (
          <a
            href={`tel:${agent.phone.replace(/\s/g, '')}`}
            className="inline-flex w-full items-center justify-center gap-2 rounded-pill bg-ink px-7 py-4 text-base font-bold tracking-[-0.01em] text-white transition-colors hover:bg-black"
          >
            <Phone size={18} /> {agent.phone}
          </a>
        ) : (
          <Button size="lg" className="w-full" onClick={() => setPhoneShown(true)}>
            <Phone size={18} /> Показать телефон
          </Button>
        )}

        <Button
          variant="outline"
          size="lg"
          className="w-full"
          onClick={() => {
            /* Заглушка чата (M5) */
          }}
        >
          <MessageSquare size={18} /> Написать
        </Button>

        {/* Нижний ряд: избранное + поделиться */}
        <div className="flex items-center gap-2.5">
          <FavButton listingId={listing.id} size={48} className="shrink-0 shadow-none ring-1 ring-border" />
          <Button variant="outline" size="lg" className="flex-1" onClick={handleShare}>
            <Share2 size={17} /> Поделиться
          </Button>
        </div>
      </div>
    </div>
  );
}
