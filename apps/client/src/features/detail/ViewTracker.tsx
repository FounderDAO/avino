/**
 * ViewTracker — регистрирует просмотр объявления при монтировании детальной
 * страницы. POST /listings/:id/view (LAST_CHANGED_API.md §2): без тела, без
 * авторизации, ответ 204; уникальность не считается (каждый вызов = +1).
 *
 * Без UI (`null`). 404 (объявление неопубликовано) и сетевые ошибки глотаем —
 * пользователю их показывать не нужно.
 */
'use client';

import * as React from 'react';
import { useRegisterListingViewMutation } from '@/store/api/listingEditApi';
import { toPrice, track } from '@/lib/analytics';

export interface ViewTrackerProps {
  id: string;
  /** Для события view_listing в GTM. */
  dealType?: string;
  price?: string;
  /** Код региона (slug справочника), напр. «toshkent-shahri». */
  city?: string | null;
}

export function ViewTracker({ id, dealType, price, city }: ViewTrackerProps) {
  const [registerView] = useRegisterListingViewMutation();

  React.useEffect(() => {
    track({
      event: 'view_listing',
      listing_id: id,
      deal_type: dealType ?? '',
      price: toPrice(price),
      city: city ?? null,
    });
    (async () => {
      try {
        await registerView(id).unwrap();
      } catch {
        // 404 (не ACTIVE) / сеть — не показываем пользователю.
      }
    })();
    // Регистрируем один раз на монтирование/смену id (LAST_CHANGED_API.md §2).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  return null;
}
