import type { Metadata } from 'next';
import { ListingDetail } from '@/features/listings/ListingDetail';

/**
 * Маршрут детальной страницы объявления (TASK-153): `/listings/:id`.
 *
 * Серверный компонент-обёртка: отдаёт метаданные и монтирует клиентский остров
 * <ListingDetail/>, который грузит карточку через RTK Query. В Next 15 `params`
 * асинхронные — поэтому await.
 */

export const metadata: Metadata = {
  title: 'Объявление — Avino',
  description: 'Детали объявления о недвижимости в Узбекистане',
};

export default async function ListingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ListingDetail id={id} />;
}
