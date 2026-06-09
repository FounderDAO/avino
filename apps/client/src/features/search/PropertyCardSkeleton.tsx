/**
 * PropertyCardSkeleton — скелетон карточки объекта (loading-состояние).
 * Повторяет геометрию PropertyCard (перенос CardSkeleton из ui.jsx).
 */
import { Skeleton } from '@/components/ui/skeleton';

export function PropertyCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-card bg-surface shadow-card">
      <Skeleton className="aspect-[16/11] rounded-none" />
      <div className="p-4">
        <Skeleton className="h-6 w-[55%]" />
        <Skeleton className="mt-3 h-3.5 w-[75%]" />
        <Skeleton className="mt-3 h-4 w-[90%]" />
        <Skeleton className="mt-2.5 h-[13px] w-[60%]" />
      </div>
    </div>
  );
}
