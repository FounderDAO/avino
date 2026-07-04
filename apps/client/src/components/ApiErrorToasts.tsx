'use client';

import { useEffect } from 'react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { subscribeApiErrors } from '@/lib/apiErrorToastBus';
import { getApiError, isNetworkError } from '@/store/api/apiError';
import type { FetchBaseQueryError } from '@reduxjs/toolkit/query/react';

/** Известные бизнес-коды → ключи `toasts.*`; остальное падает в generic. */
const CODE_KEYS: Record<string, string> = {
  RATE_LIMITED: 'rateLimited',
  OTP_RATE_LIMITED: 'rateLimited',
};

/**
 * Слушатель шины ошибок API (см. `lib/apiErrorToastBus.ts`): переводит
 * ошибку упавшей мутации в человекочитаемый текст и показывает красный toast.
 * Монтируется один раз в StoreProvider.
 */
export function ApiErrorToasts() {
  const t = useTranslations('toasts');

  useEffect(
    () =>
      subscribeApiErrors(({ error }) => {
        const apiError = getApiError(error as FetchBaseQueryError);
        const key = apiError ? CODE_KEYS[apiError.code] : undefined;
        const message = key
          ? t(key)
          : isNetworkError(error as FetchBaseQueryError)
            ? t('networkError')
            : t('genericError');
        toast.error(message);
      }),
    [t],
  );

  return null;
}
