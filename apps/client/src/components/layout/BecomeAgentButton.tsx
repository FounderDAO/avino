/**
 * BecomeAgentButton — вторичный CTA «Стать агентом» в шапке (ADR-0140).
 * Виден, только когда у пользователя УЖЕ есть объявление (квота `used >= 1`,
 * т.е. ACTIVE/NEW) и он ещё не агент — до первого объявления предложение
 * бессмысленно, а агенту не нужно.
 *
 * Состояния по статусу последней заявки (запрос делаем ЛЕНИВО — только когда
 * кнопка и так уже показалась бы, иначе шапка дёргала бы ручку у каждого
 * залогиненного гостя без объявлений):
 *  - заявок нет / REJECTED → активная ссылка на /become-agent (форма подачи
 *    либо повторной подачи);
 *  - PENDING → кнопка неактивна + подсказка «дождитесь решения» (навигация
 *    бессмысленна: страница покажет тот же статус);
 *  - APPROVED → скрыта, как и у агента по ролям (зеркалит BecomeAgent.tsx:
 *    роли из /auth/me могли ещё не подтянуться).
 *
 * Страховка от мелькания: агенту API отдаёт `{ limit: 0, used: 0 }`
 * (listings.service.getActiveListingQuota), поэтому кнопка не появится даже в
 * окне, когда роли ещё не подтянулись после silent-refresh.
 *
 * Неактивное состояние делаем через `aria-disabled`, а НЕ через `disabled`:
 * у `disabled` в buttonVariants стоит `pointer-events-none`, из-за которого
 * браузер не показал бы нативную подсказку `title` при наведении.
 *
 * Рендерится и в десктоп-ряду действий, и в мобильном меню — размер/классы/
 * закрытие меню приходят пропсами. `withHintText` дублирует подсказку строкой
 * под кнопкой: на тач-устройствах hover'а нет и `title` недостижим.
 */
'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Button, type ButtonProps } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAppSelector } from '@/store/hooks';
import { selectCurrentUser, selectIsAuthenticated } from '@/store/slices/authSlice';
import { useGetListingQuotaQuery } from '@/store/api/listingsQuotaApi';
import { useGetMyAgentApplicationQuery } from '@/store/api/agentApplicationsApi';

export function BecomeAgentButton({
  size = 'sm',
  className,
  onClick,
  withHintText = false,
}: {
  size?: ButtonProps['size'];
  className?: string;
  onClick?: () => void;
  /** Показать подсказку PENDING строкой под кнопкой (мобильное меню). */
  withHintText?: boolean;
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
  const hasListing = (quota?.used ?? 0) >= 1;
  const eligible = isAuthenticated && !isAgent && hasListing;

  const { data: application } = useGetMyAgentApplicationQuery(undefined, {
    skip: !eligible,
  });

  if (!eligible || application?.status === 'APPROVED') return null;

  if (application?.status === 'PENDING') {
    const hint = t('becomeAgentPending');
    return (
      <>
        <Button
          type="button"
          size={size}
          variant="outline"
          aria-disabled="true"
          title={hint}
          className={cn('cursor-not-allowed opacity-50', className)}
        >
          {t('becomeAgent')}
        </Button>
        {withHintText && (
          <p className="mt-1.5 text-center text-[12.5px] text-muted-foreground">
            {hint}
          </p>
        )}
      </>
    );
  }

  return (
    <Button size={size} variant="outline" asChild className={className}>
      <Link href="/become-agent" onClick={onClick}>
        {t('becomeAgent')}
      </Link>
    </Button>
  );
}
