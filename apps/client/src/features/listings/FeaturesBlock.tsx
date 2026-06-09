import type { ListingDetail } from '@/store/api/listingsApi';

/**
 * Описание + удобства карточки (TASK-153, дизайн-спек §4.3).
 *
 * Структурированные удобства (`features[]`, имена переведены по `?lang`)
 * рендерятся chips-пилюлями. Если структурных нет — фолбэк на свободный
 * `features_text`. Описание показывается с сохранением переносов строк.
 */
export function FeaturesBlock({ listing }: { listing: ListingDetail }) {
  const hasDescription = Boolean(listing.description?.trim());
  // `features` опционально: бэкенд отдаёт структурные удобства только с M5,
  // до тех пор поля нет в ответе (см. listingsApi.ts) → фолбэк на features_text.
  const features = listing.features ?? [];
  const hasFeatures = features.length > 0;
  const hasFeaturesText = Boolean(listing.features_text?.trim());

  if (!hasDescription && !hasFeatures && !hasFeaturesText) return null;

  return (
    <div className="flex flex-col gap-6">
      {hasDescription && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-bold tracking-tight text-foreground">
            Описание
          </h2>
          <p className="whitespace-pre-line text-base leading-relaxed text-foreground">
            {listing.description}
          </p>
        </section>
      )}

      {hasFeatures ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-bold tracking-tight text-foreground">
            Удобства
          </h2>
          <ul className="flex flex-wrap gap-2">
            {features.map((f) => (
              <li
                key={f.id}
                className="rounded-full bg-accent px-3 py-1 text-sm font-medium text-accent-foreground"
              >
                {f.name}
              </li>
            ))}
          </ul>
        </section>
      ) : (
        hasFeaturesText && (
          <section className="flex flex-col gap-2">
            <h2 className="text-lg font-bold tracking-tight text-foreground">
              Удобства
            </h2>
            <p className="text-base leading-relaxed text-foreground">
              {listing.features_text}
            </p>
          </section>
        )
      )}
    </div>
  );
}
