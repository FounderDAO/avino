import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import {
  JwtAuthGuard,
  OptionalJwtAuthGuard,
  RolesGuard,
} from '../common/guards';

/**
 * RolesModule — переиспользуемый RBAC-слой (TASK-044, ADR-011).
 *
 * Бандлит инфраструктуру авторизации, чтобы feature-модули (auth, users,
 * listings, admin, …) получали Bearer-аутентификацию и проверку ролей одним
 * импортом, не регистрируя `JwtModule` у себя.
 *
 * - {@link JwtAuthGuard} проверяет access-токен (`JWT_ACCESS_SECRET` — per-call,
 *   секрет не глобальный, ADR-0010), поэтому `JwtModule.register({})` без секрета.
 * - {@link RolesGuard} использует глобальный `Reflector` (Nest core).
 * - `ConfigService` доступен глобально (AppConfigModule, ADR-0006).
 *
 * Экспортирует guard'ы и `JwtModule`, чтобы guard-инстансы корректно
 * резолвили `JwtService` в импортирующих модулях. {@link OptionalJwtAuthGuard}
 * (мягкая аутентификация публичных эндпоинтов, TASK-051) наследует те же deps.
 */
@Module({
  imports: [JwtModule.register({})],
  providers: [JwtAuthGuard, OptionalJwtAuthGuard, RolesGuard],
  exports: [JwtAuthGuard, OptionalJwtAuthGuard, RolesGuard, JwtModule],
})
export class RolesModule {}
