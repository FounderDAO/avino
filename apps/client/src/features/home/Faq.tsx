/**
 * Faq — аккордеон вопросов и ответов о портале Avino.
 * 'use client' — управляем раскрытием через состояние (одна активная панель).
 * Ссылка «Все вопросы» ведёт на /help.
 */
'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { ChevronDown } from 'lucide-react';
import { SectionTitle } from '@/components/ui/section-title';

/** Ключи вопросов FAQ (контент — в словарях home.faq.items.*). */
const ITEM_KEYS = ['price', 'contact', 'moderation', 'languages', 'map'] as const;

export function Faq() {
  const t = useTranslations('home');
  // Индекс открытой панели (null — все закрыты).
  const [open, setOpen] = React.useState<number | null>(0);

  return (
    <section className="mx-auto max-w-[820px] px-4 pb-4 pt-16 sm:px-6">
      <SectionTitle
        title={t('faq.title')}
        action={
          <Link
            href="/help"
            className="shrink-0 text-[15px] font-bold text-teal hover:text-teal-deep"
          >
            {t('faq.all')}
          </Link>
        }
      />
      <div className="flex flex-col gap-3">
        {ITEM_KEYS.map((key, i) => {
          const isOpen = open === i;
          return (
            <div
              key={key}
              className="overflow-hidden rounded-card border border-border/60 bg-surface shadow-card"
            >
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : i)}
                aria-expanded={isOpen}
                className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-base font-bold text-ink"
              >
                {t(`faq.items.${key}.q`)}
                <ChevronDown
                  size={20}
                  className={
                    'shrink-0 text-muted-foreground transition-transform duration-200 ' +
                    (isOpen ? 'rotate-180' : '')
                  }
                />
              </button>
              {isOpen && (
                <div className="px-5 pb-[18px] text-[15px] leading-relaxed text-muted-foreground">
                  {t(`faq.items.${key}.a`)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
