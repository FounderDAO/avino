import { IsEnum } from 'class-validator';

/**
 * Владельческие действия над собственным листингом
 * (`PATCH /api/v1/listings/:id/status`). Маппинг на listing_status и проверку
 * допустимости перехода делает ListingsService.setOwnerStatus.
 *
 * - HIDE        → ARCHIVED (временно скрыть; обратимо)
 * - MARK_SOLD   → SOLD     (только для transaction_type=SALE)
 * - MARK_RENTED → RENTED   (только для transaction_type=RENT)
 * - REACTIVATE  → ACTIVE | NEW (см. smart-return)
 */
export enum OwnerListingAction {
  HIDE = 'HIDE',
  MARK_SOLD = 'MARK_SOLD',
  MARK_RENTED = 'MARK_RENTED',
  REACTIVATE = 'REACTIVATE',
}

/** Тело `PATCH /api/v1/listings/:id/status` (owner). */
export class OwnerStatusDto {
  @IsEnum(OwnerListingAction)
  action!: OwnerListingAction;
}
