/**
 * AgentCTA — тёмный CTA-баннер для собственников и агентов (из home.jsx).
 * «Разместить объявление» → /sell. Справа — карточки преимуществ TOP/VIP/Лиды.
 * Server component: кнопка-ссылка через Button asChild.
 */
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';

/** Преимущества размещения (как в дизайн-источнике). */
const PERKS: { key: 'top' | 'vip' | 'leads'; gold?: boolean }[] = [
  { key: 'top' },
  { key: 'vip', gold: true },
  { key: 'leads' },
];

export function AgentCTA() {
  const t = useTranslations('home');
  return (
    <section className="mx-auto max-w-[1280px] px-4 pb-4 pt-16 sm:px-6">
      <div className="relative grid grid-cols-1 items-center gap-8 overflow-hidden rounded-feature bg-ink p-8 text-white sm:grid-cols-[1.4fr_1fr] sm:p-12">
        <div>
          <span className="inline-block rounded-pill bg-red/20 px-3.5 py-1.5 text-[13px] font-bold text-[#ff9ca0]">
            Avino Pro
          </span>
          <h2 className="mt-4 text-[28px] text-white sm:text-[34px]">
            {t('cta.title')}
          </h2>
          <p className="mt-2.5 max-w-[420px] text-[16.5px] text-white/75">
            {t('cta.text')}
          </p>
          <Button asChild size="lg" className="mt-6">
            <Link href="/sell">{t('cta.button')}</Link>
          </Button>
        </div>
        {/* Карточки преимуществ — только на десктопе */}
        <div className="hidden justify-end gap-3.5 sm:flex">
          {PERKS.map((p) => (
            <div
              key={p.key}
              className="min-w-[110px] rounded-[14px] border border-white/[0.12] bg-white/[0.07] px-4 py-[18px] text-center"
            >
              <div
                className={
                  'text-lg font-extrabold ' + (p.gold ? 'text-[#E8C07A]' : 'text-white')
                }
              >
                {t(`cta.perks.${p.key}.title`)}
              </div>
              <div className="mt-1.5 text-[12.5px] text-white/70">
                {t(`cta.perks.${p.key}.text`)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
