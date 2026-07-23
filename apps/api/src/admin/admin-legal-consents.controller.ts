import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@avino/shared';
import { Roles } from '../common/decorators';
import { JwtAuthGuard, RolesGuard } from '../common/guards';
import { PaginatedResponse } from '../moderation';
import {
  AdminLegalConsentsService,
  LegalConsentItem,
  LegalConsentVersionSummary,
} from './admin-legal-consents.service';
import { ListLegalConsentsQueryDto } from './dto/list-legal-consents.dto';

/**
 * AdminLegalConsentsController — read-only журнал согласий с юр-документами
 * (Правила/Политика) для админ-панели. Аудит-поверхность → только **ADMIN**
 * (`JwtAuthGuard` + `RolesGuard`, `@Roles(ADMIN)`), как admin-логи. Префикс
 * `api` ставит main.ts; версия URI обязательна (CLAUDE.md §14).
 */
@Controller({ path: 'admin/legal-consents', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminLegalConsentsController {
  constructor(
    private readonly service: AdminLegalConsentsService,
  ) {}

  /** `GET /api/v1/admin/legal-consents` — пагинированная история согласий. */
  @Get()
  list(
    @Query() query: ListLegalConsentsQueryDto,
  ): Promise<PaginatedResponse<LegalConsentItem>> {
    return this.service.listConsents(query);
  }

  /** `GET /api/v1/admin/legal-consents/versions` — версии + даты + счётчики. */
  @Get('versions')
  versions(): Promise<LegalConsentVersionSummary[]> {
    return this.service.listVersions();
  }
}
