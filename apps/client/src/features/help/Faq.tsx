/**
 * Faq — клиентский аккордеон частых вопросов справочного центра.
 * Перенос FAQ-секции из claudeDesign/scripts/help.jsx на Tailwind-токены.
 * Включает: поиск по вопросам, фильтр категорий, раскрывающиеся ответы.
 */
'use client';

import * as React from 'react';
import { Search, ChevronDown, Home, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { fieldClass } from '@/components/ui/field';
import { cn } from '@/lib/utils';

/** Категории справки (ключ → заголовок/описание/иконка). */
const CATS = [
  {
    key: 'buyers',
    title: 'Покупателям и арендаторам',
    text: 'Поиск, избранное, сохранённые поиски, связь с автором',
    icon: Search,
  },
  {
    key: 'owners',
    title: 'Собственникам и агентам',
    text: 'Размещение, модерация, продвижение TOP/VIP, лиды',
    icon: Home,
  },
  {
    key: 'account',
    title: 'Аккаунт и безопасность',
    text: 'Вход по коду, профиль, уведомления, безопасная сделка',
    icon: User,
  },
] as const;

type CatKey = (typeof CATS)[number]['key'];

/** Список вопросов-ответов [категория, вопрос, ответ]. */
const FAQ: ReadonlyArray<readonly [CatKey, string, string]> = [
  ['buyers', 'Как сохранить объявление в избранное?', 'Нажмите на сердечко в правом верхнем углу карточки объявления. Чтобы сохранять и возвращаться к объявлениям, нужно войти в аккаунт по коду из SMS.'],
  ['buyers', 'Что такое сохранённый поиск?', 'Это ваши параметры поиска (район, цена, число комнат), сохранённые в личном кабинете. Включите уведомления — и Avino пришлёт письмо, когда появятся новые подходящие объявления.'],
  ['buyers', 'Как связаться с автором объявления?', 'На странице объявления нажмите «Написать» — откроется чат с автором, или «Показать телефон». Для этого нужно войти в аккаунт.'],
  ['owners', 'Как разместить объявление?', 'Нажмите «Разместить» в шапке, войдите по коду и заполните форму из 6 шагов: тип, параметры, цена, адрес на карте, фото и описание. После отправки объявление попадёт на модерацию.'],
  ['owners', 'Сколько длится модерация?', 'Обычно несколько часов. После одобрения объявление становится активным, появляется в поиске и автоматически переводится на узбекский, русский и английский.'],
  ['owners', 'Чем отличаются TOP и VIP?', 'TOP поднимает объявление выше обычных в списке выдачи. VIP добавляет премиальный бейдж и даёт максимальный охват. Тарифы — на 7, 14 и 30 дней.'],
  ['owners', 'Почему объявление отклонили?', 'Чаще всего из-за некорректных фото, дубликата, неверной цены или неполного описания. Исправьте замечание из уведомления и отправьте объявление повторно.'],
  ['account', 'Как войти в аккаунт?', 'Введите номер телефона — придёт код подтверждения по SMS. Введите код, и вы в аккаунте. Пароль не нужен.'],
  ['account', 'Как сменить язык интерфейса?', 'Используйте переключатель языка в шапке (UZ / RU / EN) или измените язык в разделе «Профиль» личного кабинета.'],
  ['account', 'Что такое безопасная сделка?', 'Это рекомендации Avino по проверке объекта и документов, встречам в безопасных местах и защите от мошенничества. Avino не запрашивает предоплату за просмотр.'],
];

export function Faq() {
  const [cat, setCat] = React.useState<CatKey | 'all'>('all');
  const [open, setOpen] = React.useState<string | null>(null);
  const [q, setQ] = React.useState('');

  // Фильтрация по категории и текстовому запросу
  let items = FAQ.filter(([t]) => cat === 'all' || t === cat);
  if (q) {
    const needle = q.toLowerCase();
    items = items.filter(([, question, answer]) =>
      (question + answer).toLowerCase().includes(needle),
    );
  }

  const activeCat = CATS.find((c) => c.key === cat);

  return (
    <>
      {/* Hero с поиском */}
      <section className="bg-gradient-to-b from-mint to-background px-6 py-14 text-center">
        <div className="mx-auto max-w-[720px]">
          <h1 className="text-[clamp(34px,5vw,52px)]">Чем можем помочь?</h1>
          <p className="mt-3 text-[17px] text-muted-foreground">
            Найдите ответ в справке или напишите в поддержку Avino.
          </p>
          <div className="relative mx-auto mt-6 max-w-[560px]">
            <Search
              size={20}
              strokeWidth={1.9}
              className="pointer-events-none absolute left-[18px] top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              className={cn(fieldClass, 'h-14 rounded-pill pl-[50px] pr-[18px] text-base shadow-card')}
              placeholder="Например: как разместить объявление"
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
                <h3 className="text-lg">{c.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{c.text}</p>
              </button>
            );
          })}
        </div>
      </section>

      {/* Аккордеон вопросов */}
      <section className="mx-auto max-w-[860px] px-6 pt-12">
        <div className="mb-[18px] flex flex-wrap items-center justify-between gap-2.5">
          <h2 className="text-[28px]">{cat === 'all' ? 'Частые вопросы' : activeCat?.title}</h2>
          {(cat !== 'all' || q) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setCat('all');
                setQ('');
              }}
            >
              Показать все
            </Button>
          )}
        </div>

        {items.length === 0 ? (
          <p className="text-[15px] text-muted-foreground">
            По запросу ничего не найдено. Попробуйте переформулировать или напишите в поддержку.
          </p>
        ) : (
          <div className="flex flex-col gap-3.5">
            {items.map(([, question, answer]) => {
              const isOpen = open === question;
              return (
                <div
                  key={question}
                  className="cursor-pointer rounded-card border border-border/60 bg-surface px-5 shadow-card"
                  onClick={() => setOpen(isOpen ? null : question)}
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
