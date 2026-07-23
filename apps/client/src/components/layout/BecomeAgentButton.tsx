/**
 * BecomeAgentButton — вторичный CTA «Стать агентом» в шапке (ADR-0140).
 * Виден, только когда у пользователя УЖЕ есть объявление (квота `used >= 1`,
 * т.е. ACTIVE/NEW) и он ещё не агент — до первого объявления предложение
 * бессмысленно, а агенту не нужно. Статус заявки (PENDING/REJECTED) не
 * запрашиваем: кнопка ведёт на /become-agent, который сам показывает нужное
 * состояние.
 *
 * Страховка от мелькания: агенту API отдаёт `{ limit: 0, used: 0 }`
 * (listings.service.getActiveListingQuota), поэтому кнопка не появится даже в
 * окне, когда роли из /auth/me ещё не подтянулись после silent-refresh.
 *
 * Рендерится и в десктоп-ряду действий, и в мобильном меню — размер/классы/
 * закрытие меню приходят пропсами.
 */
'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Button, type ButtonProps } from '@/components/ui/button';
import { useAppSelector } from '@/store/hooks';
import { selectCurrentUser, selectIsAuthenticated } from '@/store/slices/authSlice';
import { useGetListingQuotaQuery } from '@/store/api/listingsQuotaApi';

export function BecomeAgentButton({
  size = 'sm',
  className,
  onClick,
}: {
  size?: ButtonProps['size'];
  className?: string;
  onClick?: () => void;
}) {
  const t = useTranslations('nav');
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const currentUser = useAppSelector(selectCurrentUser);
  const isAgent = Boolean(
    currentUser?.roles.some((r) => r === 'AGENT' || r === 'AGENCY'),
  );

  const { data: quota } = useGetListingQuotaQuery(undefined, {
    skip: !isAuthenticated || isAgent,
  });

  if (!isAuthenticated || isAgent || (quota?.used ?? 0) < 1) return null;

  return (
    <Button size={size} variant="outline" asChild className={className}>
      <Link href="/become-agent" onClick={onClick}>
        {t('becomeAgent')}
      </Link>
    </Button>
  );
}
