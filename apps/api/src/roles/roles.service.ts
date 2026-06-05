import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma';

/** Запись справочника ролей в ответе API (API.md §6). */
export interface RoleResponse {
  code: string;
  description: string | null;
}

/**
 * RolesService — чтение сидируемого справочника ролей (TASK-130, API.md §6).
 *
 * `roles` — словарь, а не enum (ADR-0011): набор задаётся seed.ts из общего
 * `UserRole` (@avino/shared). GUEST не сидируется и здесь не возвращается.
 * Сортировка по `code` для детерминированного ответа.
 */
@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  /** `GET /api/v1/roles` — весь справочник ролей. */
  async listRoles(): Promise<RoleResponse[]> {
    const roles = await this.prisma.role.findMany({
      select: { code: true, description: true },
      orderBy: { code: 'asc' },
    });
    return roles;
  }
}
