import {
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import {
  BroadcastAudience,
  Language,
  NotificationChannel,
  UserStatus,
} from '@prisma/client';
import { UserRole } from '@avino/shared';

export class CreateBroadcastDto {
  @IsEnum(BroadcastAudience)
  audienceType!: BroadcastAudience;

  @ValidateIf((o) => o.audienceType === BroadcastAudience.SINGLE)
  @IsUUID()
  targetUserId?: string;

  @IsEnum(Language)
  language!: Language;

  @IsOptional()
  @IsEnum(UserStatus)
  filterStatus?: UserStatus;

  @IsOptional()
  @IsEnum(UserRole)
  filterRole?: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(NotificationChannel, { each: true })
  channels!: NotificationChannel[];

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  title!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  body!: string;

  @IsIn(['now', 'scheduled'])
  mode!: 'now' | 'scheduled';

  @ValidateIf((o) => o.mode === 'scheduled')
  @IsISO8601()
  scheduledAt?: string;
}
