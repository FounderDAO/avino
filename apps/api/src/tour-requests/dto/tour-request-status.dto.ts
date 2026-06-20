import { IsEnum } from 'class-validator';

/** Действие владельца/покупателя над заявкой. */
export enum TourRequestAction {
  CONFIRM = 'CONFIRM',
  DECLINE = 'DECLINE',
  CANCEL = 'CANCEL',
}

/** Тело `PATCH /api/v1/tour-requests/:id/status`. */
export class TourRequestStatusDto {
  @IsEnum(TourRequestAction)
  action!: TourRequestAction;
}
