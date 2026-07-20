/**
 * AdvertisePage — лендинг «Рекламодателям» (/advertise).
 * Маркетинговая страница в духе Zillow advertising: hero → ценность → форматы →
 * шаги → контактная секция (email + Telegram; телефона пока нет — по ТЗ заказчика).
 * Server component: статичный контент + якорь на #contact, интерактив не нужен.
 * Строки — next-intl (неймспейс `advertise`).
 */
import { useTranslations } from 'next-intl';
import {
  Mail,
  Send,
  Target,
  MapPin,
  Sparkles,
  Megaphone,
  Star,
  Tag,
  Rocket,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Контакты (по ТЗ: только email + Telegram, номера пока нет). */
const EMAIL = 'support@avino.uz';
const TELEGRAM = 'avino_uz';

/** Блоки «Почему Avino»: иконка + ключи заголовка/текста в неймспейсе why. */
const WHY = [
  { icon: Target, title: 'audienceTitle', text: 'audienceText' },
  { icon: MapPin, title: 'reachTitle', text: 'reachText' },
  { icon: Sparkles, title: 'premiumTitle', text: 'premiumText' },
] as const;

/** Форматы размещения: иконка + ключи в неймспейсе formats. */
const FORMATS = [
  { icon: Megaphone, title: 'bannerTitle', text: 'bannerText' },
  { icon: Star, title: 'featuredTitle', text: 'featuredText' },
  { icon: Tag, title: 'brandTitle', text: 'brandText' },
  { icon: Rocket, title: 'specialTitle', text: 'specialText' },
] as const;

const STEPS = ['1', '2', '3'] as const;

export function AdvertisePage() {
  const t = useTranslations('advertise');
  return (
    <div className="fade-up pb-16">
      {/* Hero — тёмный ink-баннер, зеркалит AgentCTA. */}
      <section className="mx-auto max-w-[1280px] px-4 pt-6 sm:px-6">
        <div className="relative overflow-hidden rounded-feature bg-ink px-6 py-14 text-white sm:px-14 sm:py-20">
          <span className="inline-block rounded-pill bg-red/20 px-3.5 py-1.5 text-[13px] font-bold text-[#ff9ca0]">
            {t('hero.badge')}
          </span>
          <h1 className="mt-4 max-w-[720px] text-[32px] leading-tight text-white sm:text-[46px]">
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

      {/* Почему Avino — три карточки ценности. */}
      <section className="mx-auto max-w-[1280px] px-4 pt-16 sm:px-6">
        <h2 className="text-[26px] sm:text-[32px]">{t('why.title')}</h2>
        <p className="mt-2 max-w-[620px] text-[16px] text-muted-2">{t('why.subtitle')}</p>
        <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-3">
          {WHY.map(({ icon: Icon, title, text }) => (
            <div
              key={title}
              className="rounded-card border border-border bg-surface p-6 shadow-card"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-[14px] bg-red/10 text-red">
                <Icon className="h-6 w-6" strokeWidth={1.8} />
              </div>
              <h3 className="mt-4 text-[18px]">{t(`why.${title}`)}</h3>
              <p className="mt-2 text-[14.5px] leading-relaxed text-muted-2">
                {t(`why.${text}`)}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Форматы размещения — четыре карточки. */}
      <section className="mx-auto max-w-[1280px] px-4 pt-16 sm:px-6">
        <h2 className="text-[26px] sm:text-[32px]">{t('formats.title')}</h2>
        <p className="mt-2 max-w-[620px] text-[16px] text-muted-2">{t('formats.subtitle')}</p>
        <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {FORMATS.map(({ icon: Icon, title, text }) => (
            <div key={title} className="rounded-card border border-border bg-surface-2 p-6">
              <div className="flex h-11 w-11 items-center justify-center rounded-[12px] bg-ink text-white">
                <Icon className="h-5 w-5" strokeWidth={1.8} />
              </div>
              <h3 className="mt-4 text-[17px]">{t(`formats.${title}`)}</h3>
              <p className="mt-2 text-[14px] leading-relaxed text-muted-2">
                {t(`formats.${text}`)}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Как начать — три шага. */}
      <section className="mx-auto max-w-[1280px] px-4 pt-16 sm:px-6">
        <h2 className="text-[26px] sm:text-[32px]">{t('steps.title')}</h2>
        <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-3">
          {STEPS.map((n) => (
            <div key={n} className="rounded-card bg-surface p-6 shadow-card">
              <div className="flex h-10 w-10 items-center justify-center rounded-pill bg-red text-[17px] font-extrabold text-white">
                {n}
              </div>
              <h3 className="mt-4 text-[18px]">{t(`steps.step${n}Title`)}</h3>
              <p className="mt-2 text-[14.5px] leading-relaxed text-muted-2">
                {t(`steps.step${n}Text`)}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Контакты — тёмная секция, email + Telegram (без телефона). */}
      <section id="contact" className="mx-auto max-w-[1280px] scroll-mt-24 px-4 pt-16 sm:px-6">
        <div className="rounded-feature bg-ink px-6 py-12 text-white sm:px-14 sm:py-16">
          <h2 className="max-w-[560px] text-[26px] text-white sm:text-[32px]">
            {t('contact.title')}
          </h2>
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
                <span className="block truncate text-[16px] font-bold text-white">
                  @{TELEGRAM}
                </span>
              </span>
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
