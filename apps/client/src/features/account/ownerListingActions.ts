/**
 * Чистая модель владельческих действий над карточкой «Мои объявления».
 * Возвращает упорядоченный список кнопок в зависимости от статуса листинга и
 * типа сделки. Маппинг действий на API — в myListingsApi.setMyListingStatus;
 * подписи кнопок — в i18n account.myListings.actions.{labelKey}.
 */
import type { ListingStatus, TransactionType } from '@/lib/mock/types';

export type OwnerAction = 'HIDE' | 'MARK_SOLD' | 'MARK_RENTED' | 'REACTIVATE';

export interface OwnerActionDescriptor {
  action: OwnerAction;
  labelKey: 'hide' | 'markSold' | 'markRented' | 'reactivate';
  variant: 'default' | 'outline';
  /** true → перед вызовом мутации спросить подтверждение (продано/сдано). */
  confirm: boolean;
}

/** «Продано» для SALE, «Сдано» для RENT (по transaction_type листинга). */
function sellAction(tx: TransactionType): OwnerActionDescriptor {
  return tx === 'SALE'
    ? { action: 'MARK_SOLD', labelKey: 'markSold', variant: 'outline', confirm: true }
    : { action: 'MARK_RENTED', labelKey: 'markRented', variant: 'outline', confirm: true };
}

const HIDE: OwnerActionDescriptor = {
  action: 'HIDE',
  labelKey: 'hide',
  variant: 'outline',
  confirm: false,
};
const REACTIVATE: OwnerActionDescriptor = {
  action: 'REACTIVATE',
  labelKey: 'reactivate',
  variant: 'default',
  confirm: false,
};

export function ownerActionsFor(
  status: ListingStatus | undefined,
  tx: TransactionType,
): OwnerActionDescriptor[] {
  switch (status) {
    case 'ACTIVE':
    case 'NEW':
    case 'DRAFT':
    case 'REJECTED':
      return [HIDE, sellAction(tx)];
    case 'ARCHIVED':
      return [REACTIVATE, sellAction(tx)];
    case 'SOLD':
    case 'RENTED':
      return [REACTIVATE];
    default:
      return [];
  }
}
