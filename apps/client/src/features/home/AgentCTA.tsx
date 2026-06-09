/**
 * AgentCTA — тёмный CTA-баннер для собственников и агентов (из home.jsx).
 * «Разместить объявление» → /sell. Справа — карточки преимуществ TOP/VIP/Лиды.
 * Server component: кнопка-ссылка через Button asChild.
 */
import Link from 'next/link';
import { Button } from '@/components/ui/button';

/** Преимущества размещения (как в дизайн-источнике). */
const PERKS: { title: string; text: string; gold?: boolean }[] = [
  { title: 'TOP', text: 'Выше в выдаче' },
  { title: 'VIP', text: 'Максимум показов', gold: true },
  { title: 'Лиды', text: 'Чат и звонки' },
];

export function AgentCTA() {
  return (
    <section className="mx-auto max-w-[1280px] px-4 pb-4 pt-16 sm:px-6">
      <div className="relative grid grid-cols-1 items-center gap-8 overflow-hidden rounded-feature bg-ink p-8 text-white sm:grid-cols-[1.4fr_1fr] sm:p-12">
        <div>
          <span className="inline-block rounded-pill bg-red/20 px-3.5 py-1.5 text-[13px] font-bold text-[#ff9ca0]">
            Avino Pro
          </span>
          <h2 className="mt-4 text-[28px] text-white sm:text-[34px]">
            Продаёте или сдаёте жильё?
          </h2>
          <p className="mt-2.5 max-w-[420px] text-[16.5px] text-white/75">
            Разместите объявление за пару минут. Бесплатная публикация, продвижение
            TOP/VIP и доступ к лидам.
          </p>
          <Button asChild size="lg" className="mt-6">
            <Link href="/sell">Разместить объявление</Link>
          </Button>
        </div>
        {/* Карточки преимуществ — только на десктопе */}
        <div className="hidden justify-end gap-3.5 sm:flex">
          {PERKS.map((p) => (
            <div
              key={p.title}
              className="min-w-[110px] rounded-[14px] border border-white/[0.12] bg-white/[0.07] px-4 py-[18px] text-center"
            >
              <div
                className={
                  'text-lg font-extrabold ' + (p.gold ? 'text-[#E8C07A]' : 'text-white')
                }
              >
                {p.title}
              </div>
              <div className="mt-1.5 text-[12.5px] text-white/70">{p.text}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
