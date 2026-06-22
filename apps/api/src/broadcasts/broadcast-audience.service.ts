import { Injectable } from '@nestjs/common';
import {
  BroadcastAudience,
  Language,
  Prisma,
  UserStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma';

export interface AudienceParams {
  audienceType: BroadcastAudience;
  targetUserId?: string | null;
  language: Language;
  filterStatus?: UserStatus | null;
  filterRole?: string | null;
}

export interface AudiencePreview {
  total: number;
  perChannel: { inApp: number; email: number; push: number; sms: number };
}

/**
 * Резолв аудитории рассылки (ADR-0103). Единственный источник правды
 * «параметры рассылки → Prisma where по users». Достижимость по каналу
 * (email/phone/устройство) применяется поверх базового where.
 */
@Injectable()
export class BroadcastAudienceService {
  constructor(private readonly prisma: PrismaService) {}

  /** Базовый where аудитории (без фильтра достижимости канала). */
  buildUserWhere(params: AudienceParams): Prisma.UserWhereInput {
    if (params.audienceType === BroadcastAudience.SINGLE) {
      // targetUserId гарантируется DTO-валидацией на HTTP-пути; явный guard
      // защищает внутренних вызывающих (на UUID-колонке строка-плейсхолдер
      // вызвала бы DB-ошибку invalid-uuid, а не пустую выборку).
      if (!params.targetUserId) {
        throw new Error('targetUserId is required for SINGLE audience');
      }
      return { id: params.targetUserId };
    }
    const where: Prisma.UserWhereInput = {
      status: params.filterStatus ?? UserStatus.ACTIVE,
      defaultLanguage: params.language,
    };
    if (params.filterRole) {
      where.roles = { some: { role: { code: params.filterRole } } };
    }
    return where;
  }

  /** Размер аудитории + достижимые по каждому каналу (для превью/подтверждения). */
  async previewCounts(params: AudienceParams): Promise<AudiencePreview> {
    const base = this.buildUserWhere(params);
    const [total, email, push, sms] = await Promise.all([
      this.prisma.user.count({ where: base }),
      this.prisma.user.count({ where: { ...base, email: { not: null } } }),
      this.prisma.user.count({
        where: { ...base, notificationDevices: { some: { isActive: true } } },
      }),
      this.prisma.user.count({ where: { ...base, phone: { not: null } } }),
    ]);
    return { total, perChannel: { inApp: total, email, push, sms } };
  }
}
