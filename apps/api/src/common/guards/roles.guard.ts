import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@avino/shared';
import { ApiErrorCode } from '../dto/error-response.dto';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { AuthenticatedUser } from './jwt-auth.guard';

/** Минимальный структурный тип запроса — без зависимости от `@types/express`. */
interface RequestWithUser {
  user?: AuthenticatedUser;
}

/**
 * RolesGuard — авторизация по ролям из `@Roles(...)` (TASK-044, ADR-011).
 *
 * Запускается ПОСЛЕ {@link JwtAuthGuard} (порядок в `@UseGuards(JwtAuthGuard,
 * RolesGuard)`), т.к. опирается на `request.user`. Логика:
 *  - хендлер/класс без `@Roles(...)` → требуется только аутентификация (`true`);
 *  - `request.user` отсутствует (guard не подключён) → `401 UNAUTHORIZED`;
 *  - нет пересечения ролей пользователя с требуемыми → `403 FORBIDDEN`;
 *  - есть хотя бы одна требуемая роль (OR-семантика) → доступ разрешён.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Метаданные хендлера переопределяют метаданные класса (getAllAndOverride).
    const required = this.reflector.getAllAndOverride<UserRole[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;
    if (!user) {
      throw new HttpException(
        { code: ApiErrorCode.UNAUTHORIZED, message: 'Authentication required' },
        HttpStatus.UNAUTHORIZED,
      );
    }

    const allowed = user.roles.some((role) => required.includes(role));
    if (!allowed) {
      throw new HttpException(
        { code: ApiErrorCode.FORBIDDEN, message: 'Insufficient role' },
        HttpStatus.FORBIDDEN,
      );
    }
    return true;
  }
}
