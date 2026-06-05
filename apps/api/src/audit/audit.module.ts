import { Module } from '@nestjs/common';
import { AuditService } from './audit.service';

/**
 * AuditModule — read-side security audit-лога (TASK-131, API.md §16).
 *
 * Экспортирует {@link AuditService}, который читает кросс-доменную таблицу
 * `audit_logs`. HTTP-слой (роут `GET /admin/audit-logs`) живёт в `AdminModule`
 * ({@link AdminLogsController}) рядом с остальными админ-роутами; этот модуль —
 * только бизнес-логика чтения, чтобы владение таблицей не привязывалось к домену.
 * PrismaService доступен глобально (`PrismaModule` `@Global`).
 */
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
