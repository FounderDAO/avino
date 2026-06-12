/**
 * SellFaq — аккордеон частых вопросов лендинга (порт Faq из sell.jsx).
 * Локальный стейт открытого пункта; первый раскрыт по умолчанию.
 */
'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown } from 'lucide-react';

/** Пункты FAQ (вопрос/ответ — в словаре `sell.faq.items`). */
const FAQ_KEYS = ['price', 'speed', 'agent', 'languages'] as const;

export function SellFaq() {
  const t = useTranslations('sell');
  const [open, setOpen] = useState(0);

  return (
    <div className="flex flex-col gap-3.5">
      {FAQ_KEYS.map((k, i) => {
        const active = open === i;
        return (
          <div
            key={k}
            className="cursor-pointer rounded-card bg-surface px-5 shadow-card"
            onClick={() => setOpen(active ? -1 : i)}
          >
            <div className="flex items-center justify-between gap-4 py-4">
              <span className="text-[16.5px] font-bold">{t(`faq.items.${k}.q`)}</span>
              <ChevronDown
                size={20}
                className={
                  'shrink-0 text-teal transition-transform duration-200 ' +
                  (active ? 'rotate-180' : '')
                }
              />
            </div>
            {active && (
              <p className="m-0 pb-[18px] text-[15px] leading-[1.6] text-muted-foreground">
                {t(`faq.items.${k}.a`)}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
