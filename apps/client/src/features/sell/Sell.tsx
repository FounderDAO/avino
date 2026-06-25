/**
 * Sell — секции лендинга «Продать/Сдать» (порт apps/claudeDesign/scripts/sell.jsx).
 * Server-friendly: вся интерактивность вынесена в SellFaq ('use client').
 * Секции: Hero, «Как продавать» (пути), «Как это работает» (шаги),
 * продвижение (TOP/VIP — мок-тарифы), FAQ, финальный CTA.
 */
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
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

/** Метрики hero-блока (значение/подпись — в словаре `sell.hero.stats`). */
const STAT_KEYS = ['free', 'langs', 'buyers'] as const;

/** Шаги «как продать на Avino» (тексты — в словаре `sell.how.steps`). */
const STEP_KEYS = ['post', 'moderation', 'replies', 'deal'] as const;

/** Мок-тарифы продвижения (NORMAL — бесплатно, TOP/VIP — платные). */
const PROMOS: { tier: string; key: 'top' | 'vip'; color: string }[] = [
  { tier: 'TOP', key: 'top', color: 'text-[#ff9ca0]' },
  { tier: 'VIP', key: 'vip', color: 'text-[#E8C07A]' },
];

export function Sell() {
  const t = useTranslations('sell');
  return (
    <div className="fade-up">
      {/* Hero */}
      <section className="bg-[linear-gradient(180deg,#FBF9F5,var(--background))] py-12 sm:py-14">
        <div className="mx-auto grid max-w-[1180px] grid-cols-1 items-center gap-12 px-6 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <span className="inline-block rounded-pill bg-mint px-[14px] py-1.5 text-[13px] font-bold text-teal-deep">
              {t('hero.badge')}
            </span>
            <h1 className="display mt-4 text-[clamp(38px,5vw,60px)]">
              {t.rich('hero.title', {
                accent: (chunks) => <span className="text-red">{chunks}</span>,
              })}
            </h1>
            <p className="my-[18px] mb-7 max-w-[470px] text-lg text-muted-foreground">
              {t('hero.subtitle')}
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link href="/sell/new">{t('hero.ctaPost')}</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <a href="#how">{t('hero.ctaHow')}</a>
              </Button>
            </div>
            <div className="mt-8 flex gap-6">
              {STAT_KEYS.map((k) => (
                <div key={k}>
                  <div className="text-xl font-extrabold">{t(`hero.stats.${k}.value`)}</div>
                  <div className="text-[12.5px] text-muted-foreground">
                    {t(`hero.stats.${k}.label`)}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="relative aspect-[4/5] overflow-hidden rounded-feature shadow-raised">
            <PhotoImg src={HERO} alt="" sizes="(max-width: 1280px) 50vw, 600px" />
          </div>
        </div>
      </section>

      {/* Пути продажи */}
      <section className="mx-auto max-w-[1180px] px-6 pt-4">
        <h2 className="text-center text-3xl">{t('paths.title')}</h2>
        <p className="mb-7 mt-1.5 text-center text-muted-foreground">{t('paths.subtitle')}</p>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          <Path
            accent
            icon={HomeIcon}
            title={t('paths.self.title')}
            text={t('paths.self.text')}
            cta={t('paths.self.cta')}
            href="/sell/new"
          />
          <Path
            icon={User}
            title={t('paths.agent.title')}
            text={t('paths.agent.text')}
            cta={t('paths.agent.cta')}
            href="/sell/new"
          />
          <Path
            icon={Building}
            title={t('paths.rent.title')}
            text={t('paths.rent.text')}
            cta={t('paths.rent.cta')}
            href="/sell/new"
          />
        </div>
      </section>

      {/* Как это работает */}
      <section id="how" className="mx-auto max-w-[1180px] scroll-mt-24 px-6 pt-16">
        <h2 className="mb-8 text-center text-3xl">{t('how.title')}</h2>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {STEP_KEYS.map((k, i) => (
            <div key={k} className="relative">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-red text-lg font-extrabold text-white">
                {i + 1}
              </span>
              <h3 className="mt-3.5 text-lg">{t(`how.steps.${k}.title`)}</h3>
              <p className="mt-1.5 text-[14.5px] leading-[1.55] text-muted-foreground">
                {t(`how.steps.${k}.text`)}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Продвижение TOP/VIP */}
      <section className="mx-auto max-w-[1180px] px-6 pt-16">
        <div className="rounded-feature bg-ink px-6 py-10 text-white sm:px-12 sm:py-11">
          <div className="mb-6">
            <span className="inline-block rounded-pill bg-red/20 px-[14px] py-1.5 text-[13px] font-bold text-[#ff9ca0]">
              {t('promo.badge')}
            </span>
            <h2 className="mt-3.5 text-[32px] text-white">{t('promo.title')}</h2>
            <p className="mt-2 max-w-[460px] text-base text-white/70">{t('promo.subtitle')}</p>
          </div>
          <div className="grid grid-cols-1 gap-[18px] sm:grid-cols-2">
            {PROMOS.map((p) => (
              <div
                key={p.tier}
                className="rounded-[16px] border border-white/10 bg-white/[0.06] px-6 py-[22px]"
              >
                <div className="flex items-center justify-between">
                  <span className={'text-[22px] font-extrabold ' + p.color}>{p.tier}</span>
                  <span className="text-base font-bold">{t(`promo.${p.key}.price`)}</span>
                </div>
                <p className="mt-2.5 text-[14.5px] text-white/70">{t(`promo.${p.key}.text`)}</p>
              </div>
            ))}
          </div>
          <Button asChild size="lg" className="mt-6">
            <Link href="/sell/new">{t('promo.cta')}</Link>
          </Button>
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-[820px] px-6 pt-16">
        <h2 className="mb-5 text-3xl">{t('faq.title')}</h2>
        <SellFaq />
      </section>

      {/* Финальный CTA */}
      <section className="mx-auto max-w-[1180px] px-6 pb-6 pt-14 text-center">
        <h2 className="mx-auto max-w-[560px] text-[32px]">{t('finalCta.title')}</h2>
        <p className="mt-2.5 text-[17px] text-muted-foreground">{t('finalCta.subtitle')}</p>
        <Button asChild size="lg" className="mt-5">
          <Link href="/sell/new">{t('finalCta.cta')}</Link>
        </Button>
      </section>
    </div>
  );
}
