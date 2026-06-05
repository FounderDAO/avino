import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import {
  JwtAuthGuard,
  OptionalJwtAuthGuard,
  RolesGuard,
} from '../common/guards';
import { RolesController } from './roles.controller';
import { RolesService } from './roles.service';

/**
 * RolesModule — переиспользуемый RBAC-слой (TASK-044, ADR-011) + справочник
 * ролей (TASK-130, API.md §6).
 *
 * Бандлит инфраструктуру авторизации, чтобы feature-модули (auth, users,
 * listings, admin, …) получали Bearer-аутентификацию и проверку ролей одним
 * импортом, не регистрируя `JwtModule` у себя. Дополнительно обслуживает
 * `GET /api/v1/roles` ({@link RolesController}) — словарь ролей для админ-UI.
 *
 * - {@link JwtAuthGuard} проверяет access-токен (`JWT_ACCESS_SECRET` — per-call,
 *   секрет не глобальный, ADR-0010), поэтому `JwtModule.register({})` без секрета.
 * - {@link RolesGuard} использует глобальный `Reflector` (Nest core).
 * - `ConfigService` доступен глобально (AppConfigModule, ADR-0006).
 * - `PrismaService` доступен глобально (PrismaModule @Global) — {@link RolesService}.
 *
 * Экспортирует guard'ы и `JwtModule`, чтобы guard-инстансы корректно
 * резолвили `JwtService` в импортирующих модулях. {@link OptionalJwtAuthGuard}
 * (мягкая аутентификация публичных эндпоинтов, TASK-051) наследует те же deps.
 */
@Module({
  imports: [JwtModule.register({})],
  controllers: [RolesController],
  providers: [JwtAuthGuard, OptionalJwtAuthGuard, RolesGuard, RolesService],
  exports: [JwtAuthGuard, OptionalJwtAuthGuard, RolesGuard, JwtModule],
})
export class RolesModule {}
