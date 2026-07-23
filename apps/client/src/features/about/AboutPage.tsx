/**
 * AboutPage — страница «О компании» (/about, «Biz haqimizda»).
 * Маркетинговая страница в духе Zillow About: hero-миссия → история →
 * «Avino сегодня» (мягкие формулировки, без точных цифр) → ценности →
 * для кого → контакты/CTA (email + Telegram + кнопки в продукт).
 * Server component: статичный контент + якорь на #contact, интерактив не нужен.
 * Строки — next-intl (неймспейс `about`). Секция «Команда» отложена (добавим позже).
 */
import { useTranslations } from 'next-intl';
import {
  Map,
  Building2,
  BadgeCheck,
  Languages,
  ShieldCheck,
  MapPin,
  Sparkles,
  Home,
  KeyRound,
  Briefcase,
  Mail,
  Send,
  Plus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';

/** Контакты (как на /advertise: только email + Telegram, номера пока нет). */
const EMAIL = 'support@avino.uz';
const TELEGRAM = 'avino_uz';

/** «Avino сегодня» — плитки с мягкими формулировками (без точных чисел). */
const NUMBERS = [
  { icon: Map, title: 'countryTitle', text: 'countryText' },
  { icon: Building2, title: 'listingsTitle', text: 'listingsText' },
  { icon: BadgeCheck, title: 'agentsTitle', text: 'agentsText' },
  { icon: Languages, title: 'langsTitle', text: 'langsText' },
] as const;

/** Ценности: иконка + ключи заголовка/текста в неймспейсе values. */
const VALUES = [
  { icon: ShieldCheck, title: 'honestTitle', text: 'honestText' },
  { icon: MapPin, title: 'coverageTitle', text: 'coverageText' },
  { icon: Sparkles, title: 'techTitle', text: 'techText' },
] as const;

/** Сегменты «Для кого Avino»: иконка + ключи в неймспейсе audience. */
const AUDIENCE = [
  { icon: Home, title: 'buyersTitle', text: 'buyersText' },
  { icon: KeyRound, title: 'ownersTitle', text: 'ownersText' },
  { icon: Briefcase, title: 'agentsTitle', text: 'agentsText' },
] as const;

export function AboutPage() {
  const t = useTranslations('about');
  return (
    <div className="fade-up pb-16">
      {/* Hero — тёмный ink-баннер, зеркалит /advertise. */}
      <section className="mx-auto max-w-[1280px] px-4 pt-6 sm:px-6">
        <div className="relative overflow-hidden rounded-feature bg-ink px-6 py-14 text-white sm:px-14 sm:py-20">
          <span className="inline-block rounded-pill bg-red/20 px-3.5 py-1.5 text-[13px] font-bold text-[#ff9ca0]">
            {t('hero.badge')}
          </span>
          <h1 className="mt-4 max-w-[760px] text-[32px] leading-tight text-white sm:text-[46px]">
            {t('hero.title')}
          </h1>
          <p className="mt-4 max-w-[560px] text-[16.5px] leading-relaxed text-white/75">
            {t('hero.subtitle')}
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-4">
            <Button asChild size="lg">
              <a href="#contact">{t('hero.cta')}</a>
            </Button>
            <span className="text-[13.5px] text-white/60">{t('hero.note')}</span>
          </div>
        </div>
      </section>

      {/* История — почему создали Avino. */}
      <section className="mx-auto max-w-[1280px] px-4 pt-16 sm:px-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[0.85fr_1.15fr] lg:gap-12">
          <h2 className="text-[26px] sm:text-[32px]">{t('story.title')}</h2>
          <div className="max-w-[640px]">
            <p className="text-[19px] font-semibold leading-snug text-ink">{t('story.lead')}</p>
            <p className="mt-4 text-[15.5px] leading-relaxed text-muted-2">{t('story.p1')}</p>
            <p className="mt-4 text-[15.5px] leading-relaxed text-muted-2">{t('story.p2')}</p>
          </div>
        </div>
      </section>

      {/* Avino сегодня — 4 плитки, мягкие формулировки. */}
      <section className="mx-auto max-w-[1280px] px-4 pt-16 sm:px-6">
        <div className="rounded-feature bg-surface-2 px-6 py-12 sm:px-12">
          <h2 className="text-[26px] sm:text-[32px]">{t('numbers.title')}</h2>
          <p className="mt-2 max-w-[620px] text-[16px] text-muted-2">{t('numbers.subtitle')}</p>
          <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {NUMBERS.map(({ icon: Icon, title, text }) => (
              <div key={title}>
                <div className="flex h-12 w-12 items-center justify-center rounded-[14px] bg-ink text-white">
                  <Icon className="h-6 w-6" strokeWidth={1.8} />
                </div>
                <h3 className="mt-4 text-[19px] font-bold text-ink">{t(`numbers.${title}`)}</h3>
                <p className="mt-1 text-[14.5px] leading-relaxed text-muted-2">
                  {t(`numbers.${text}`)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Наши ценности — три карточки. */}
      <section className="mx-auto max-w-[1280px] px-4 pt-16 sm:px-6">
        <h2 className="text-[26px] sm:text-[32px]">{t('values.title')}</h2>
        <p className="mt-2 max-w-[620px] text-[16px] text-muted-2">{t('values.subtitle')}</p>
        <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-3">
          {VALUES.map(({ icon: Icon, title, text }) => (
            <div key={title} className="rounded-card border border-border bg-surface p-6 shadow-card">
              <div className="flex h-12 w-12 items-center justify-center rounded-[14px] bg-red/10 text-red">
                <Icon className="h-6 w-6" strokeWidth={1.8} />
              </div>
              <h3 className="mt-4 text-[18px]">{t(`values.${title}`)}</h3>
              <p className="mt-2 text-[14.5px] leading-relaxed text-muted-2">{t(`values.${text}`)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Для кого Avino — три сегмента. */}
      <section className="mx-auto max-w-[1280px] px-4 pt-16 sm:px-6">
        <h2 className="text-[26px] sm:text-[32px]">{t('audience.title')}</h2>
        <p className="mt-2 max-w-[620px] text-[16px] text-muted-2">{t('audience.subtitle')}</p>
        <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-3">
          {AUDIENCE.map(({ icon: Icon, title, text }) => (
            <div key={title} className="rounded-card border border-border bg-surface-2 p-6">
              <div className="flex h-11 w-11 items-center justify-center rounded-[12px] bg-ink text-white">
                <Icon className="h-5 w-5" strokeWidth={1.8} />
              </div>
              <h3 className="mt-4 text-[17px]">{t(`audience.${title}`)}</h3>
              <p className="mt-2 text-[14px] leading-relaxed text-muted-2">{t(`audience.${text}`)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Контакты / CTA — тёмная секция: email + Telegram + кнопки в продукт. */}
      <section id="contact" className="mx-auto max-w-[1280px] scroll-mt-24 px-4 pt-16 sm:px-6">
        <div className="rounded-feature bg-ink px-6 py-12 text-white sm:px-14 sm:py-16">
          <h2 className="max-w-[560px] text-[26px] text-white sm:text-[32px]">{t('contact.title')}</h2>
          <p className="mt-3 max-w-[560px] text-[16px] text-white/75">{t('contact.text')}</p>

          <div className="mt-8 grid grid-cols-1 gap-4 sm:max-w-[640px] sm:grid-cols-2">
            <a
              href={`mailto:${EMAIL}`}
              className="flex items-center gap-4 rounded-[16px] border border-white/[0.14] bg-white/[0.06] px-5 py-4 transition-colors hover:border-white/40"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] bg-red text-white">
                <Mail className="h-5 w-5" strokeWidth={1.8} />
              </span>
              <span className="min-w-0">
                <span className="block text-[12.5px] uppercase tracking-wide text-white/55">
                  {t('contact.emailLabel')}
                </span>
                <span className="block truncate text-[16px] font-bold text-white">{EMAIL}</span>
              </span>
            </a>
            <a
              href={`https://t.me/${TELEGRAM}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-4 rounded-[16px] border border-white/[0.14] bg-white/[0.06] px-5 py-4 transition-colors hover:border-white/40"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] bg-[#2AABEE] text-white">
                <Send className="h-5 w-5" strokeWidth={1.8} />
              </span>
              <span className="min-w-0">
                <span className="block text-[12.5px] uppercase tracking-wide text-white/55">
                  {t('contact.telegramLabel')}
                </span>
                <span className="block truncate text-[16px] font-bold text-white">@{TELEGRAM}</span>
              </span>
            </a>
          </div>

          {/* Действия в продукт. */}
          <div className="mt-7 flex flex-wrap gap-3">
            <Link
              href="/sell"
              className="inline-flex items-center gap-2 rounded-pill bg-red px-6 py-3.5 text-[15px] font-bold text-white transition-colors hover:bg-red/90"
            >
              <Plus className="h-[18px] w-[18px]" strokeWidth={2.2} /> {t('contact.postCta')}
            </Link>
            <Link
              href="/become-agent"
              className="inline-flex items-center gap-2 rounded-pill border border-white/25 px-6 py-3.5 text-[15px] font-bold text-white transition-colors hover:border-white/60"
            >
              {t('contact.agentCta')}
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
