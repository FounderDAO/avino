/**
 * Страница объявления, которое удалено (410) или временно на проверке после
 * правки (503). Статус ставит middleware; здесь — понятный текст и путь в поиск.
 * Рендерится вместо notFound(): notFound() переписал бы статус на 404.
 */
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';

export function ListingUnavailable({ reason }: { reason: 'gone' | 'updating' }) {
  const t = useTranslations('listing');
  return (
    <div className="mx-auto max-w-[1280px] px-4 py-20 sm:px-6">
      <EmptyState
        title={t(`unavailable.${reason}.title`)}
        text={t(`unavailable.${reason}.text`)}
        action={
          <Button asChild>
            <Link href="/search?tx=SALE">{t('notFound.cta')}</Link>
          </Button>
        }
      />
    </div>
  );
}
