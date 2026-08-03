/**
 * Корневой not-found портала — рендерится при notFound() из App Router
 * (в т.ч. из catch-all [...rest]/page.tsx для несуществующих URL под /[locale])
 * и при hasLocale()-редиректе из layout.tsx. Стиль — по образцу
 * /listing/[id]/not-found.tsx.
 */
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';

export default function NotFound() {
  const t = useTranslations('notFound');
  return (
    <div className="mx-auto max-w-[1280px] px-4 py-20 sm:px-6">
      <EmptyState
        title={t('title')}
        text={t('text')}
        action={
          <Button asChild>
            <Link href="/">{t('cta')}</Link>
          </Button>
        }
      />
    </div>
  );
}
