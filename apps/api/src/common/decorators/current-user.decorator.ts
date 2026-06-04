import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedUser } from '../guards/jwt-auth.guard';

/** Минимальный структурный тип запроса — без зависимости от `@types/express`. */
interface RequestWithUser {
  user?: AuthenticatedUser;
}

/**
 * `@CurrentUser()` — извлечь аутентифицированного пользователя из запроса
 * (TASK-044). Значение кладёт {@link JwtAuthGuard} в `request.user`, поэтому
 * декоратор имеет смысл только на эндпоинтах под `@UseGuards(JwtAuthGuard)`.
 *
 * Без аргумента возвращает весь объект {@link AuthenticatedUser}; с ключом —
 * конкретное поле (`@CurrentUser('id')`). Если guard не отработал, вернёт
 * `undefined` — защиту обеспечивает guard, а не декоратор.
 *
 * @example
 * ```ts
 * @UseGuards(JwtAuthGuard)
 * @Get('me')
 * me(@CurrentUser() user: AuthenticatedUser) { return user; }
 *
 * @UseGuards(JwtAuthGuard)
 * @Get('my-id')
 * id(@CurrentUser('id') userId: string) { return userId; }
 * ```
 */
/**
 * Фабрика `@CurrentUser()` — вынесена отдельно, чтобы покрыть юнит-тестами
 * (param-декораторы Nest иначе не вызвать напрямую).
 */
export function currentUserFactory(
  data: keyof AuthenticatedUser | undefined,
  ctx: ExecutionContext,
): AuthenticatedUser | AuthenticatedUser[keyof AuthenticatedUser] | undefined {
  const request = ctx.switchToHttp().getRequest<RequestWithUser>();
  const user = request.user;
  if (!user) {
    return undefined;
  }
  return data ? user[data] : user;
}

export const CurrentUser = createParamDecorator(currentUserFactory);
