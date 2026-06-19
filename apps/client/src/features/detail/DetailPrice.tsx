/**
 * DetailPrice — клиентский компонент-обёртка для цены на странице объекта.
 * Detail.tsx — async server component, поэтому не может вызывать хуки напрямую.
 * Вынесен сюда по тому же паттерну, что DetailMap и ContactCard.
 *
 * Подписывается на usePriceFormatter → цена следует за переключателем [сум|$]
 * без изменения визуального вывода (тот же wrapper div/классы).
 */
'use client';

import type { Listing } from '@/lib/mock/types';
import { usePriceFormatter } from '@/lib/usePriceFormatter';

export interface DetailPriceProps {
  listing: Pick<Listing, 'price' | 'currency' | 'tx'>;
}

export function DetailPrice({ listing }: DetailPriceProps) {
  const fmt = usePriceFormatter();
  return <div className="display mt-3.5 text-[40px]">{fmt.price(listing)}</div>;
}
