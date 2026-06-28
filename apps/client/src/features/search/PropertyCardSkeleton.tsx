/**
 * PropertyCardSkeleton — скелетон карточки объекта (loading-состояние).
 * Повторяет геометрию компактной PropertyCard (фото 16:9 + 3 строки тела).
 */
import { Skeleton } from '@/components/ui/skeleton';

export function PropertyCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-card bg-surface shadow-card">
      <Skeleton className="aspect-[16/9] rounded-none" />
      <div className="px-3 py-2">
        <Skeleton className="h-5 w-[45%]" />
        <Skeleton className="mt-2 h-3.5 w-[70%]" />
        <Skeleton className="mt-2 h-3 w-[55%]" />
      </div>
    </div>
  );
}
