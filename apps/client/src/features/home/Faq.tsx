/**
 * Faq — аккордеон вопросов и ответов о портале Avino.
 * 'use client' — управляем раскрытием через состояние (одна активная панель).
 * Ссылка «Все вопросы» ведёт на /help.
 */
'use client';

import * as React from 'react';
import { Link } from '@/i18n/navigation';
import { ChevronDown } from 'lucide-react';
import { SectionTitle } from '@/components/ui/section-title';

/** Мок-контент FAQ. */
const ITEMS: { q: string; a: string }[] = [
  {
    q: 'Сколько стоит разместить объявление?',
    a: 'Базовая публикация на Avino бесплатна. Платными являются опции продвижения — TOP и VIP, которые поднимают объявление выше в выдаче и увеличивают число показов.',
  },
  {
    q: 'Как связаться с собственником или агентом?',
    a: 'На странице объявления доступны контакты автора — телефон и чат. Avino Pro отмечает проверенных профессионалов специальным значком.',
  },
  {
    q: 'Объявления проверяются перед публикацией?',
    a: 'Да. Все объявления проходят модерацию: мы проверяем корректность данных, фотографии и цену, чтобы выдача оставалась честной.',
  },
  {
    q: 'На каких языках работает портал?',
    a: 'Интерфейс Avino доступен на трёх языках: узбекском, русском и английском. Переключить язык можно в шапке сайта.',
  },
  {
    q: 'Можно ли искать недвижимость на карте?',
    a: 'Да, в результатах поиска есть режим карты — объекты показываются пинами с ценой, что удобно для выбора по локации.',
  },
];

export function Faq() {
  // Индекс открытой панели (null — все закрыты).
  const [open, setOpen] = React.useState<number | null>(0);

  return (
    <section className="mx-auto max-w-[820px] px-4 pb-4 pt-16 sm:px-6">
      <SectionTitle
        title="Частые вопросы"
        action={
          <Link
            href="/help"
            className="shrink-0 text-[15px] font-bold text-teal hover:text-teal-deep"
          >
            Все вопросы
          </Link>
        }
      />
      <div className="flex flex-col gap-3">
        {ITEMS.map((item, i) => {
          const isOpen = open === i;
          return (
            <div
              key={i}
              className="overflow-hidden rounded-card border border-border/60 bg-surface shadow-card"
            >
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : i)}
                aria-expanded={isOpen}
                className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-base font-bold text-ink"
              >
                {item.q}
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
                  {item.a}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
