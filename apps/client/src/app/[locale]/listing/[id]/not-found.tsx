/**
 * not-found для /listing/[id] — объект не найден / снят с публикации.
 */
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';

export default function ListingNotFound() {
  return (
    <div className="mx-auto max-w-[1280px] px-4 py-20 sm:px-6">
      <EmptyState
        title="Объявление не найдено"
        text="Возможно, оно было снято с публикации."
        action={
          <Button asChild>
            <Link href="/search?tx=SALE">К поиску</Link>
          </Button>
        }
      />
    </div>
  );
}
