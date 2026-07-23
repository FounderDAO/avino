import { Injectable } from '@nestjs/common';
import { OtpChannel, OtpPurpose, Prisma } from '@prisma/client';
import { PaginatedResponse } from '../moderation';
import { PrismaService } from '../prisma';
import { ListOtpLogsQueryDto } from './dto/list-otp-logs.dto';

/**
 * Вычисляемый статус OTP-записи: `consumed_at` заполняется и при успешном
 * verify, и при инвалидации старого кода новым запросом (otp-code.util), поэтому
 * CONSUMED = «Погашен», а не строго «Использован». EXPIRED — код никем не погашен
 * и срок истёк (вероятная недоставка). ACTIVE — код ждёт ввода.
 */
export type OtpLogStatus = 'ACTIVE' | 'CONSUMED' | 'EXPIRED';

/** Запись журнала OTP-запросов (`GET /admin/otp-logs`). Кода/хеша в ответе нет. */
export interface OtpLogItem {
  id: string;
  destination: string;
  channel: OtpChannel;
  purpose: OtpPurpose;
  attempts: number;
  status: OtpLogStatus;
  user_id: string | null;
  user_name: string | null;
  created_at: string;
  expires_at: string;
  consumed_at: string | null;
}

/** Дефолты пагинации админ-списка (API.md §4: default `limit` 20, max 100). */
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const OTP_SELECT = {
  id: true,
  destination: true,
  channel: true,
  purpose: true,
  attempts: true,
  expiresAt: true,
  consumedAt: true,
  createdAt: true,
  userId: true,
  user: { select: { profile: { select: { displayName: true } } } },
} as const;

type OtpRow = Prisma.OtpCodeGetPayload<{ select: typeof OTP_SELECT }>;

/**
 * AdminOtpLogsService — read-side журнала OTP-запросов для админ-панели
 * (ADR-0150). Глобальный пагинированный срез `otp_codes` (записи не удаляются —
 * таблица и есть история). Сценарий поддержки: по жалобе «код не пришёл» найти
 * контакт и увидеть выписанные коды, их статусы и попытки. `code_hash` наружу
 * не отдаётся. Доступ — только ADMIN (RolesGuard в AdminLogsController).
 */
@Injectable()
export class AdminOtpLogsService {
  constructor(private readonly prisma: PrismaService) {}

  /** `GET /api/v1/admin/otp-logs` — журнал OTP-запросов. */
  async listOtpLogs(
    query: ListOtpLogsQueryDto,
  ): Promise<PaginatedResponse<OtpLogItem>> {
    const page = query.page ?? DEFAULT_PAGE;
    const limit = Math.min(query.limit ?? DEFAULT_LIMIT, MAX_LIMIT);

    const where: Prisma.OtpCodeWhereInput = {};
    if (query.destination) {
      where.destination = { contains: query.destination };
    }

    const [rows, total] = await Promise.all([
      this.prisma.otpCode.findMany({
        where,
        select: OTP_SELECT,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.otpCode.count({ where }),
    ]);

    return {
      data: rows.map((row) => this.toItem(row)),
      meta: { page, limit, total },
    };
  }

  private toItem(row: OtpRow): OtpLogItem {
    const status: OtpLogStatus = row.consumedAt
      ? 'CONSUMED'
      : row.expiresAt.getTime() <= Date.now()
        ? 'EXPIRED'
        : 'ACTIVE';
    return {
      id: row.id,
      destination: row.destination,
      channel: row.channel,
      purpose: row.purpose,
      attempts: row.attempts,
      status,
      user_id: row.userId,
      user_name: row.user?.profile?.displayName ?? null,
      created_at: row.createdAt.toISOString(),
      expires_at: row.expiresAt.toISOString(),
      consumed_at: row.consumedAt?.toISOString() ?? null,
    };
  }
}
