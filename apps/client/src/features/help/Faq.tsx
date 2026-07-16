/**
 * Faq — клиентский аккордеон частых вопросов справочного центра.
 * Перенос FAQ-секции из claudeDesign/scripts/help.jsx на Tailwind-токены.
 * Включает: поиск по вопросам, фильтр категорий, раскрывающиеся ответы.
 */
'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Search, ChevronDown, Home, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { fieldClass } from '@/components/ui/field';
import { cn } from '@/lib/utils';

/** Категории справки (ключ → иконка); заголовок/описание — help.cats.{key}. */
const CATS = [
  { key: 'buyers', icon: Search },
  { key: 'owners', icon: Home },
  { key: 'account', icon: User },
] as const;

type CatKey = (typeof CATS)[number]['key'];

/**
 * Нормализация текста для поиска: нижний регистр + удаление апострофов всех
 * начертаний. В узбекской латинице слова пишутся с апострофом (e'lon, o', g'),
 * а пользователи набирают запрос без него ("elon") — без нормализации подстрока
 * не находится, и поиск «ничего не находит».
 */
const normalize = (s: string) => s.toLowerCase().replace(/['’‘ʻʼ`´]/g, '');

/** Список вопросов-ответов [категория, ключ help.faq.items.{key}]. */
const FAQ: ReadonlyArray<readonly [CatKey, string]> = [
  ['buyers', 'favorites'],
  ['buyers', 'savedSearch'],
  ['buyers', 'contactAuthor'],
  ['owners', 'postListing'],
  ['owners', 'moderation'],
  ['owners', 'topVip'],
  ['owners', 'rejected'],
  ['account', 'login'],
  ['account', 'language'],
  ['account', 'safeDeal'],
];

export function Faq() {
  const t = useTranslations('help');
  const [cat, setCat] = React.useState<CatKey | 'all'>('all');
  const [open, setOpen] = React.useState<string | null>(null);
  const [q, setQ] = React.useState('');

  // Фильтрация по категории и текстовому запросу
  let items = FAQ.filter(([c]) => cat === 'all' || c === cat).map(
    ([, key]) =>
      [key, t(`faq.items.${key}.q`), t(`faq.items.${key}.a`)] as const,
  );
  // Поиск по словам, а не по всей фразе: запрос вроде «elon qanday joylash
  // mumkin» — это набор слов, а не точная подстрока ответа. Считаем, сколько
  // слов запроса встретилось в вопросе+ответе (после нормализации апострофов).
  const tokens = normalize(q).split(/\s+/).filter(Boolean);
  if (tokens.length) {
    const scored = items
      .map((it) => {
        const hay = normalize(it[1] + ' ' + it[2]);
        return [it, tokens.filter((w) => hay.includes(w)).length] as const;
      })
      .filter(([, hits]) => hits > 0);
    // Показываем самые релевантные — с максимальным числом совпавших слов
    // (для «elon qanday joylash mumkin» это ровно вопрос про размещение).
    const best = scored.reduce((mx, [, hits]) => Math.max(mx, hits), 0);
    items = scored.filter(([, hits]) => hits === best).map(([it]) => it);
  }

  return (
    <>
      {/* Hero с поиском */}
      <section className="bg-gradient-to-b from-mint to-background px-6 py-14 text-center">
        <div className="mx-auto max-w-[720px]">
          <h1 className="text-[clamp(34px,5vw,52px)]">{t('hero.title')}</h1>
          <p className="mt-3 text-[17px] text-muted-foreground">
            {t('hero.subtitle')}
          </p>
          <div className="relative mx-auto mt-6 max-w-[560px]">
            <Search
              size={20}
              strokeWidth={1.9}
              className="pointer-events-none absolute left-[18px] top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              className={cn(fieldClass, 'h-14 rounded-pill pl-[50px] pr-[18px] text-base shadow-card')}
              placeholder={t('hero.searchPlaceholder')}
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setCat('all');
              }}
            />
          </div>
        </div>
      </section>

      {/* Категории */}
      <section className="mx-auto max-w-[1200px] px-6 pt-2">
        <div className="grid grid-cols-1 gap-[18px] sm:grid-cols-3">
          {CATS.map((c) => {
            const on = cat === c.key;
            const Icon = c.icon;
            return (
              <button
                key={c.key}
                onClick={() => {
                  setCat(on ? 'all' : c.key);
                  setQ('');
                }}
                className={cn(
                  'flex flex-col gap-2.5 rounded-card border bg-surface p-6 text-left shadow-card transition-colors',
                  on ? 'border-[1.5px] border-teal' : 'border-border hover:border-ink',
                )}
              >
                <span
                  className={cn(
                    'flex h-12 w-12 items-center justify-center rounded-[13px]',
                    on ? 'bg-teal text-white' : 'bg-mint text-teal',
                  )}
                >
                  <Icon size={24} strokeWidth={1.8} />
                </span>
                <h3 className="text-lg">{t(`cats.${c.key}.title`)}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {t(`cats.${c.key}.text`)}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      {/* Аккордеон вопросов */}
      <section className="mx-auto max-w-[860px] px-6 pt-12">
        <div className="mb-[18px] flex flex-wrap items-center justify-between gap-2.5">
          <h2 className="text-[28px]">
            {cat === 'all' ? t('faq.title') : t(`cats.${cat}.title`)}
          </h2>
          {(cat !== 'all' || q) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setCat('all');
                setQ('');
              }}
            >
              {t('faq.showAll')}
            </Button>
          )}
        </div>

        {items.length === 0 ? (
          <p className="text-[15px] text-muted-foreground">{t('faq.empty')}</p>
        ) : (
          <div className="flex flex-col gap-3.5">
            {items.map(([key, question, answer]) => {
              const isOpen = open === key;
              return (
                <div
                  key={key}
                  className="cursor-pointer rounded-card border border-border/60 bg-surface px-5 shadow-card"
                  onClick={() => setOpen(isOpen ? null : key)}
                >
                  <div className="flex items-center justify-between gap-4 py-4">
                    <span className="text-[16.5px] font-bold">{question}</span>
                    <ChevronDown
                      size={20}
                      className={cn(
                        'shrink-0 text-teal transition-transform duration-200',
                        isOpen && 'rotate-180',
                      )}
                    />
                  </div>
                  {isOpen && (
                    <p className="m-0 pb-[18px] text-[15px] leading-relaxed text-muted-foreground">
                      {answer}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
