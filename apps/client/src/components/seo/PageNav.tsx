/**
 * PageNav — номерная пагинация обычными ссылками (`?page=N`) в серверном HTML.
 *
 * Нужна краулерам: без неё объявления дальше первой страницы достижимы только
 * через sitemap. Для людей остаётся «Показать ещё»; ссылки работают и без JS.
 */
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { pageHref, pageWindow } from '@/lib/seo/pagination';

interface PageNavProps {
  locale: string;
  /** Путь без локали, напр. `/search` или `/agents/<id>`. */
  pathname: string;
  /** Текущие query-параметры (фильтры сохраняются в ссылках). */
  searchParams: Record<string, string | string[] | undefined>;
  page: number;
  totalPages: number;
}

export async function PageNav({ locale, pathname, searchParams, page, totalPages }: PageNavProps) {
  if (totalPages <= 1) return null;
  const t = await getTranslations({ locale, namespace: 'pagination' });
  const href = (p: number) => pageHref(pathname, searchParams, p);
  const item =
    'inline-flex h-9 min-w-9 items-center justify-center rounded-md border border-border px-3 text-sm font-semibold';

  return (
    <nav aria-label={t('label')} className="px-5 pb-6">
      <ul className="flex flex-wrap items-center justify-center gap-1.5">
        {page > 1 && (
          <li>
            <Link href={href(page - 1)} locale={locale} rel="prev" className={cn(item, 'hover:bg-surface-2')}>
              {t('prev')}
            </Link>
          </li>
        )}
        {pageWindow(page, totalPages).map((p, i) =>
          p === null ? (
            <li key={`gap-${i}`} aria-hidden className="px-1 text-muted-foreground">
              …
            </li>
          ) : (
            <li key={p}>
              {p === page ? (
                <span aria-current="page" className={cn(item, 'border-ink bg-ink text-white')}>
                  {p}
                </span>
              ) : (
                <Link
                  href={href(p)}
                  locale={locale}
                  aria-label={t('page', { page: p })}
                  className={cn(item, 'hover:bg-surface-2')}
                >
                  {p}
                </Link>
              )}
            </li>
          ),
        )}
        {page < totalPages && (
          <li>
            <Link href={href(page + 1)} locale={locale} rel="next" className={cn(item, 'hover:bg-surface-2')}>
              {t('next')}
            </Link>
          </li>
        )}
      </ul>
    </nav>
  );
}
