import { MapPin } from 'lucide-react';

/**
 * Мини-карта с пином (TASK-153, дизайн-спек §4.3) — статичная заглушка.
 *
 * Реальная интерактивная карта (Yandex Maps + PostGIS) приходит в TASK-152;
 * до неё показываем стилизованный блок с координатами и пином, чтобы раскладка
 * детальной страницы была полной. Без координат блок не рендерится.
 */
export function MiniMap({
  latitude,
  longitude,
  address,
}: {
  latitude: string | null;
  longitude: string | null;
  address: string | null;
}) {
  if (!latitude || !longitude) return null;

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-bold tracking-tight text-foreground">
        На карте
      </h2>
      <div className="relative flex aspect-[16/9] items-center justify-center overflow-hidden rounded-2xl border border-border bg-[#E7E2D8]">
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md">
            <MapPin className="size-5" />
          </span>
          {address && (
            <span className="max-w-[80%] text-sm font-medium text-foreground">
              {address}
            </span>
          )}
          <span className="text-xs text-muted-foreground">
            Интерактивная карта скоро · {latitude}, {longitude}
          </span>
        </div>
      </div>
    </section>
  );
}
