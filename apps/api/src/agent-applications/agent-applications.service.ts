import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AgentApplicationStatus, Prisma } from '@prisma/client';
import { UserRole } from '@avino/shared';
import { ApiErrorCode } from '../common/dto/error-response.dto';
import { PrismaService } from '../prisma';
import { CreateAgentApplicationDto } from './dto/create-agent-application.dto';

/** Заявка «Стать агентом» в пользовательском контракте (API.md §21). */
export interface AgentApplicationResponse {
  id: string;
  status: AgentApplicationStatus;
  agency_name: string | null;
  about: string;
  reject_reason: string | null;
  created_at: string;
  resolved_at: string | null;
}

const APPLICATION_SELECT = {
  id: true,
  status: true,
  agencyName: true,
  about: true,
  rejectReason: true,
  createdAt: true,
  resolvedAt: true,
} as const;

type ApplicationRow = Prisma.AgentApplicationGetPayload<{
  select: typeof APPLICATION_SELECT;
}>;

/**
 * AgentApplicationsService — заявки «Стать агентом» (ADR-0140, API.md §21).
 *
 * Пользовательская часть: подача (`POST /users/me/agent-application`, одна
 * PENDING на пользователя — partial unique в БД страхует гонку) и статус
 * последней заявки (`GET`). Админ-часть (список/approve/reject) добавляется
 * в этом же сервисе (Task 5), HTTP — Admin-контроллер в AdminModule.
 */
@Injectable()
export class AgentApplicationsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * `POST /api/v1/users/me/agent-application` — подать заявку. Уже агент →
   * `409 ALREADY_AGENT`; есть PENDING → `409 AGENT_APPLICATION_PENDING`
   * (проверка + unique-страховка от гонки на P2002).
   */
  async create(
    userId: string,
    dto: CreateAgentApplicationDto,
  ): Promise<AgentApplicationResponse> {
    const proRoleCount = await this.prisma.userRole.count({
      where: {
        userId,
        role: { code: { in: [UserRole.AGENT, UserRole.AGENCY] } },
      },
    });
    if (proRoleCount > 0) {
      throw new ConflictException({
        code: ApiErrorCode.ALREADY_AGENT,
        message: 'User already has a professional role',
      });
    }

    const pending = await this.prisma.agentApplication.findFirst({
      where: { userId, status: AgentApplicationStatus.PENDING },
      select: { id: true },
    });
    if (pending) {
      throw new ConflictException({
        code: ApiErrorCode.AGENT_APPLICATION_PENDING,
        message: 'An agent application is already pending',
      });
    }

    try {
      const row = await this.prisma.agentApplication.create({
        data: {
          userId,
          agencyName: dto.agency_name?.trim() || null,
          about: dto.about.trim(),
        },
        select: APPLICATION_SELECT,
      });
      return this.toResponse(row);
    } catch (e) {
      // Гонка двух параллельных подач: partial unique index (user_id WHERE
      // status='PENDING') → P2002 маппим на тот же 409, что и проверка выше.
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException({
          code: ApiErrorCode.AGENT_APPLICATION_PENDING,
          message: 'An agent application is already pending',
        });
      }
      throw e;
    }
  }

  /** `GET /api/v1/users/me/agent-application` — последняя заявка или 404. */
  async getMine(userId: string): Promise<AgentApplicationResponse> {
    const row = await this.prisma.agentApplication.findFirst({
      where: { userId },
      select: APPLICATION_SELECT,
      orderBy: { createdAt: 'desc' },
    });
    if (!row) {
      throw new NotFoundException({
        code: ApiErrorCode.NOT_FOUND,
        message: 'Agent application not found',
      });
    }
    return this.toResponse(row);
  }

  private toResponse(row: ApplicationRow): AgentApplicationResponse {
    return {
      id: row.id,
      status: row.status,
      agency_name: row.agencyName,
      about: row.about,
      reject_reason: row.rejectReason,
      created_at: row.createdAt.toISOString(),
      resolved_at: row.resolvedAt?.toISOString() ?? null,
    };
  }
}
