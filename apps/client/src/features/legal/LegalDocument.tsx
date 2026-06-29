/**
 * LegalDocument — общий серверный рендер юридического документа (Правила/Политика).
 * H1 + дата + липкое оглавление (якорные ссылки, без JS) + секции (p/list/subheading).
 * Контент приходит готовой моделью LegalDoc; chrome-строки — namespace `legal`.
 */
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import type { LegalDoc } from '@/content/legal/types';
import type { Locale } from '@/i18n/routing';

function formatDate(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(iso));
}

export function LegalDocument({ doc, locale }: { doc: LegalDoc; locale: Locale }) {
  const t = useTranslations('legal');
  return (
    <div className="mx-auto max-w-[1100px] px-6 pb-20 pt-10">
      <nav className="mb-4 text-sm text-muted-foreground">
        <Link href="/" className="hover:text-ink">
          {t('breadcrumbHome')}
        </Link>
        <span className="mx-2">/</span>
        <span>{doc.title}</span>
      </nav>

      <h1 className="text-[clamp(28px,4vw,40px)]">{doc.title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {t('updatedLabel')}: {formatDate(doc.updatedAt, locale)}
      </p>
      {doc.intro && (
        <p className="mt-5 max-w-[760px] text-[15px] leading-relaxed text-muted-foreground">
          {doc.intro}
        </p>
      )}

      <div className="mt-8 gap-10 lg:grid lg:grid-cols-[260px_1fr]">
        <aside className="mb-8 lg:mb-0">
          <div className="rounded-card border border-border/60 bg-surface p-4 lg:sticky lg:top-24">
            <div className="text-sm font-bold">{t('toc')}</div>
            <ul className="mt-3 flex flex-col gap-2">
              {doc.sections.map((s) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} className="text-sm text-muted-foreground hover:text-teal">
                    {s.heading}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </aside>

        <div className="flex flex-col gap-9">
          {doc.sections.map((s) => (
            <section key={s.id} id={s.id} className="scroll-mt-24">
              <h2 className="text-[22px]">{s.heading}</h2>
              <div className="mt-3 flex flex-col gap-3 text-[15px] leading-relaxed text-muted-foreground">
                {s.blocks.map((b, i) => {
                  if (b.type === 'p') return <p key={i}>{b.text}</p>;
                  if (b.type === 'subheading')
                    return (
                      <h3 key={i} className="mt-2 text-[17px] font-bold text-ink">
                        {b.text}
                      </h3>
                    );
                  return (
                    <ul key={i} className="ml-5 flex list-disc flex-col gap-1.5">
                      {b.items.map((it, j) => (
                        <li key={j}>{it}</li>
                      ))}
                    </ul>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
