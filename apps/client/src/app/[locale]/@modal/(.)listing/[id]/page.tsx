/**
 * Перехватчик /listing/[id] для модалки (intercepting route, parallel slot @modal).
 * Срабатывает ТОЛЬКО на soft-навигацию (клик по карточке). Hard-nav / обновление /
 * прямой заход идут на полную страницу listing/[id]/page.tsx (там же SEO/JSON-LD).
 * Здесь JSON-LD и generateMetadata НЕ дублируем.
 */
import type { Metadata } from 'next';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { getListingById } from '@/lib/api/listings';
import { Detail } from '@/features/detail/Detail';
import { ListingModal } from '@/features/detail/ListingModal';

// Модалка живёт только при soft-навигации; краулер её не видит, но явный
// noindex страхует от индексации, если перехват когда-то сработает на hard-nav.
export const metadata: Metadata = { robots: { index: false, follow: true } };

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
          <Link
            href="/search"
            className="mt-4 inline-block font-bold text-teal hover:text-teal-deep"
          >
            {t('notFound.cta')}
          </Link>
        </div>
      </ListingModal>
    );
  }

  return (
    <ListingModal listingId={id} listing={listing}>
      <Detail listing={listing} embedded />
    </ListingModal>
  );
}
