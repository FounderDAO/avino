import { IsEnum, IsOptional, IsString, IsUUID, MaxLength, ValidateIf } from 'class-validator';
import { BroadcastAudience, Language, UserStatus } from '@prisma/client';

export class PreviewAudienceDto {
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
  @IsString()
  @MaxLength(40)
  filterRole?: string;
}
