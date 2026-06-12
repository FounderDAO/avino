/**
 * not-found для /listing/[id] — объект не найден / снят с публикации.
 */
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';

export default function ListingNotFound() {
  const t = useTranslations('listing');
  return (
    <div className="mx-auto max-w-[1280px] px-4 py-20 sm:px-6">
      <EmptyState
        title={t('notFound.title')}
        text={t('notFound.text')}
        action={
          <Button asChild>
            <Link href="/search?tx=SALE">{t('notFound.cta')}</Link>
          </Button>
        }
      />
    </div>
  );
}
