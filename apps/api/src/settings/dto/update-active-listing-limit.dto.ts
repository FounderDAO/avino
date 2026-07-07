import { IsInt, Max, Min } from 'class-validator';
import { ACTIVE_LISTING_LIMIT_MAX } from '../active-listing-limit.constants';

/** Тело `PATCH /api/v1/admin/active-listing-limit`. `0` = без лимита. */
export class UpdateActiveListingLimitDto {
  @IsInt()
  @Min(0)
  @Max(ACTIVE_LISTING_LIMIT_MAX)
  limit!: number;
}
