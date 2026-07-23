import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { AgentApplicationStatus } from '@prisma/client';

/** Query `GET /api/v1/admin/agent-applications` (ADR-0140, API.md §21). */
export class ListAgentApplicationsQueryDto {
  @IsOptional()
  @IsEnum(AgentApplicationStatus)
  status?: AgentApplicationStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
