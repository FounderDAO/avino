/**
 * ReportButton — круглая кнопка-иконка «Пожаловаться» на детальной странице
 * (Apple 1.2). Скрыта для владельца объявления (жаловаться на своё же
 * объявление бессмысленно). Гостю открывает LoginModal и запоминает
 * намерение; после входа — открывает ComplaintModal (паттерн «отложенное
 * намерение» — как в ContactCard: useEffect на смену isAuthenticated).
 */
'use client';

import * as React from 'react';
import { Flag } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { LoginModal } from '@/components/layout/LoginModal';
import { useAppSelector } from '@/store/hooks';
import { selectCurrentUser, selectIsAuthenticated } from '@/store/slices/authSlice';
import type { Listing } from '@/lib/mock/types';
import { ComplaintModal } from './ComplaintModal';

export interface ReportButtonProps {
  listing: Listing;
}

export function ReportButton({ listing }: ReportButtonProps) {
  const t = useTranslations('complaint');
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const currentUser = useAppSelector(selectCurrentUser);
  const [loginOpen, setLoginOpen] = React.useState(false);
  const [pendingReport, setPendingReport] = React.useState(false);
  const [modalOpen, setModalOpen] = React.useState(false);

  const isOwner =
    isAuthenticated && Boolean(currentUser?.id) && currentUser?.id === listing.ownerId;

  const handleClick = React.useCallback(() => {
    if (!isAuthenticated) {
      setPendingReport(true);
      setLoginOpen(true);
      return;
    }
    setModalOpen(true);
  }, [isAuthenticated]);

  // После успешного входа из этой кнопки — продолжаем отложенное намерение «Пожаловаться».
  React.useEffect(() => {
    if (isAuthenticated && pendingReport) {
      setPendingReport(false);
      setModalOpen(true);
    }
  }, [isAuthenticated, pendingReport]);

  // Владелец не может пожаловаться на своё объявление — скрываем кнопку целиком.
  if (isOwner) return null;

  return (
    <>
      <button
        type="button"
        aria-label={t('button')}
        title={t('button')}
        onClick={handleClick}
        className="flex h-[38px] w-[38px] items-center justify-center rounded-full border border-border bg-surface shadow-sm transition-transform duration-150 hover:bg-surface-2 active:scale-90"
      >
        <Flag size={18} strokeWidth={1.9} />
      </button>

      <ComplaintModal listingId={listing.id} open={modalOpen} onOpenChange={setModalOpen} />
      <LoginModal open={loginOpen} onOpenChange={setLoginOpen} context={t('loginContext')} />
    </>
  );
}
