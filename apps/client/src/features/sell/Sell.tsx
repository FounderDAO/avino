/**
 * Sell — секции лендинга «Продать/Сдать» (порт apps/claudeDesign/scripts/sell.jsx).
 * Server-friendly: вся интерактивность вынесена в SellFaq ('use client').
 * Секции: Hero, «Как продавать» (пути), «Как это работает» (шаги),
 * продвижение (TOP/VIP — мок-тарифы), FAQ, финальный CTA.
 */
import Link from 'next/link';
import { Building, Home as HomeIcon, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PhotoImg } from '@/components/ui/photo-img';
import { SellFaq } from './SellFaq';

const HERO =
  'https://images.unsplash.com/photo-1582268611958-ebfd161ef9cf?auto=format&fit=crop&w=1200&q=70';

/** Карточка-«путь» (как продавать). accent — выделенный (самостоятельно). */
function Path({
  icon: Icon,
  title,
  text,
  cta,
  href,
  accent,
}: {
  icon: typeof HomeIcon;
  title: string;
  text: string;
  cta: string;
  href: string;
  accent?: boolean;
}) {
  return (
    <div className="flex h-full flex-col gap-3 rounded-card bg-surface p-[26px] shadow-card">
      <span
        className={
          'flex h-13 w-13 items-center justify-center rounded-[14px] ' +
          (accent ? 'bg-red/10 text-red' : 'bg-mint text-teal')
        }
      >
        <Icon size={26} strokeWidth={1.8} />
      </span>
      <h3 className="text-xl">{title}</h3>
      <p className="flex-1 text-[14.5px] leading-[1.55] text-muted-foreground">{text}</p>
      <Button asChild variant={accent ? 'primary' : 'outline'} className="self-start">
        <Link href={href}>{cta}</Link>
      </Button>
    </div>
  );
}

/** Шаги «как продать на Avino». */
const STEPS: [string, string][] = [
  ['Разместите объявление', 'Заполните форму за пару минут: фото, цена, адрес на карте.'],
  ['Пройдите модерацию', 'Мы проверим объявление и опубликуем его на всех языках.'],
  ['Получайте отклики', 'Покупатели пишут в чат и звонят вам напрямую.'],
  ['Закройте сделку', 'Договоритесь об условиях и проведите безопасную сделку.'],
];

/** Мок-тарифы продвижения (NORMAL — бесплатно, TOP/VIP — платные). */
const PROMOS: { tier: string; text: string; price: string; color: string }[] = [
  {
    tier: 'TOP',
    text: 'Выше обычных объявлений в списке выдачи',
    price: 'от 50 000 сум',
    color: 'text-[#ff9ca0]',
  },
  {
    tier: 'VIP',
    text: 'Премиальный бейдж и максимальный охват',
    price: 'от 120 000 сум',
    color: 'text-[#E8C07A]',
  },
];

export function Sell() {
  return (
    <div className="fade-up">
      {/* Hero */}
      <section className="bg-[linear-gradient(180deg,#FBF9F5,var(--background))] py-12 sm:py-14">
        <div className="mx-auto grid max-w-[1180px] grid-cols-1 items-center gap-12 px-6 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <span className="inline-block rounded-pill bg-mint px-[14px] py-1.5 text-[13px] font-bold text-teal-deep">
              Бесплатное размещение
            </span>
            <h1 className="display mt-4 text-[clamp(38px,5vw,60px)]">
              Продайте или сдайте жильё <span className="text-red">выгодно</span>
            </h1>
            <p className="my-[18px] mb-7 max-w-[470px] text-lg text-muted-foreground">
              Разместите объявление на крупнейшем портале недвижимости Узбекистана и общайтесь
              с покупателями напрямую.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link href="/sell/new">Разместить объявление</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <a href="#how">Как это работает</a>
              </Button>
            </div>
            <div className="mt-8 flex gap-6">
              {[
                ['Бесплатно', 'базовое размещение'],
                ['3 языка', 'автоперевод'],
                ['12 000+', 'покупателей в день'],
              ].map(([a, b]) => (
                <div key={a}>
                  <div className="text-xl font-extrabold">{a}</div>
                  <div className="text-[12.5px] text-muted-foreground">{b}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="aspect-[4/5] overflow-hidden rounded-feature shadow-raised">
            <PhotoImg src={HERO} alt="" className="h-full w-full" />
          </div>
        </div>
      </section>

      {/* Пути продажи */}
      <section className="mx-auto max-w-[1180px] px-6 pt-4">
        <h2 className="text-center text-3xl">Выберите, как продавать</h2>
        <p className="mb-7 mt-1.5 text-center text-muted-foreground">
          Полный контроль или помощь профессионала — решать вам.
        </p>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          <Path
            accent
            icon={HomeIcon}
            title="Разместить самостоятельно"
            text="Бесплатная публикация, прямые контакты с покупателями и полный контроль над объявлением."
            cta="Разместить бесплатно"
            href="/sell/new"
          />
          <Path
            icon={User}
            title="Продать с агентом Avino Pro"
            text="Профессионал возьмёт на себя показы, переговоры и оформление. Вы экономите время."
            cta="Найти агента"
            href="/sell/new"
          />
          <Path
            icon={Building}
            title="Сдать в аренду"
            text="Найдите надёжного арендатора быстро — разместите объект и общайтесь в чате."
            cta="Разместить аренду"
            href="/sell/new"
          />
        </div>
      </section>

      {/* Как это работает */}
      <section id="how" className="mx-auto max-w-[1180px] scroll-mt-24 px-6 pt-16">
        <h2 className="mb-8 text-center text-3xl">Как продать на Avino</h2>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(([t, d], i) => (
            <div key={t} className="relative">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-red text-lg font-extrabold text-white">
                {i + 1}
              </span>
              <h3 className="mt-3.5 text-lg">{t}</h3>
              <p className="mt-1.5 text-[14.5px] leading-[1.55] text-muted-foreground">{d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Продвижение TOP/VIP */}
      <section className="mx-auto max-w-[1180px] px-6 pt-16">
        <div className="rounded-feature bg-ink px-6 py-10 text-white sm:px-12 sm:py-11">
          <div className="mb-6">
            <span className="inline-block rounded-pill bg-red/20 px-[14px] py-1.5 text-[13px] font-bold text-[#ff9ca0]">
              Продвижение
            </span>
            <h2 className="mt-3.5 text-[32px] text-white">Продавайте быстрее с TOP и VIP</h2>
            <p className="mt-2 max-w-[460px] text-base text-white/70">
              Поднимите объявление выше в выдаче и получите до 5× больше просмотров.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-[18px] sm:grid-cols-2">
            {PROMOS.map((p) => (
              <div
                key={p.tier}
                className="rounded-[16px] border border-white/10 bg-white/[0.06] px-6 py-[22px]"
              >
                <div className="flex items-center justify-between">
                  <span className={'text-[22px] font-extrabold ' + p.color}>{p.tier}</span>
                  <span className="text-base font-bold">{p.price}</span>
                </div>
                <p className="mt-2.5 text-[14.5px] text-white/70">{p.text}</p>
              </div>
            ))}
          </div>
          <Button asChild size="lg" className="mt-6">
            <Link href="/sell/new">Разместить и продвинуть</Link>
          </Button>
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-[820px] px-6 pt-16">
        <h2 className="mb-5 text-3xl">Частые вопросы</h2>
        <SellFaq />
      </section>

      {/* Финальный CTA */}
      <section className="mx-auto max-w-[1180px] px-6 pb-6 pt-14 text-center">
        <h2 className="mx-auto max-w-[560px] text-[32px]">Готовы разместить объявление?</h2>
        <p className="mt-2.5 text-[17px] text-muted-foreground">Это займёт всего пару минут.</p>
        <Button asChild size="lg" className="mt-5">
          <Link href="/sell/new">Разместить бесплатно</Link>
        </Button>
      </section>
    </div>
  );
}
