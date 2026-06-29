/**
 * Перехватчик /listing/[id] для модалки (intercepting route, parallel slot @modal).
 * Срабатывает ТОЛЬКО на soft-навигацию (клик по карточке). Hard-nav / обновление /
 * прямой заход идут на полную страницу listing/[id]/page.tsx (там же SEO/JSON-LD).
 * Здесь JSON-LD и generateMetadata НЕ дублируем.
 */
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { getListingById } from '@/lib/api/listings';
import { Detail } from '@/features/detail/Detail';
import { ListingModal } from '@/features/detail/ListingModal';

interface PageProps {
  params: Promise<{ locale: string; id: string }>;
}

export default async function InterceptedListingModal({ params }: PageProps) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const listing = await getListingById(id, locale);

  if (!listing) {
    const t = await getTranslations('listing');
    return (
      <ListingModal listingId={id}>
        <div className="px-6 py-16 text-center">
          <h2 className="text-xl font-extrabold text-ink">{t('notFound.title')}</h2>
          <p className="mt-2 text-muted-foreground">{t('notFound.text')}</p>
        </div>
      </ListingModal>
    );
  }

  return (
    <ListingModal listingId={id}>
      <Detail listing={listing} embedded />
    </ListingModal>
  );
}
