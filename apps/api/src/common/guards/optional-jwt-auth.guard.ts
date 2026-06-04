import { ExecutionContext, Injectable } from '@nestjs/common';
import { JwtAuthGuard, RequestLike } from './jwt-auth.guard';

/**
 * OptionalJwtAuthGuard — мягкая Bearer-аутентификация для публичных эндпоинтов
 * с расширенной видимостью для владельца (TASK-051, API.md §7).
 *
 * Поведение:
 *  - запрос БЕЗ `Authorization: Bearer <token>` → проходит как гость, `request.user`
 *    не выставляется (контроллер/сервис трактует это как анонимный доступ);
 *  - запрос С Bearer-токеном → валидируется строго через {@link JwtAuthGuard}
 *    (невалидный/истёкший токен → `401`), чтобы клиент с битыми кредами получил
 *    явную ошибку, а не молчаливый гостевой доступ.
 *
 * Так публичный `GET /api/v1/listings/:id` отдаёт ACTIVE всем, а владельцу/
 * MODERATOR/ADMIN — и непубличные статусы (видимость решает сервис по
 * `request.user`).
 */
@Injectable()
export class OptionalJwtAuthGuard extends JwtAuthGuard {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestLike>();
    if (!this.extractBearer(request)) {
      return true;
    }
    return super.canActivate(context);
  }
}
