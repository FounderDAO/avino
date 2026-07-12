import { IsOptional, IsString, MaxLength } from 'class-validator';

/** Body `POST /api/v1/admin/agent-applications/:id/reject` (ADR-0140). */
export class RejectAgentApplicationDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;
}
