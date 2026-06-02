import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Observable } from 'rxjs';

/** HTTP-заголовок корреляции запроса (входящий и исходящий). */
export const REQUEST_ID_HEADER = 'X-Request-Id';

/**
 * Минимальные структурные типы request/response, чтобы не тянуть `@types/express`
 * (его нет в зависимостях). Покрывают только используемые поля.
 */
interface RequestWithId {
  headers: Record<string, string | string[] | undefined>;
  requestId?: string;
}

interface ResponseWithHeader {
  setHeader(name: string, value: string): void;
}

/**
 * Присваивает каждому HTTP-запросу `request_id` (TASK-023):
 * - переиспользует входящий `X-Request-Id` (от прокси/клиента), если он есть;
 * - иначе генерирует UUID.
 *
 * Значение кладётся на `request.requestId` (его читает `AllExceptionsFilter`)
 * и возвращается клиенту в заголовке `X-Request-Id` — это коррелирует ответ
 * с серверными логами (docs/API.md §4: `error.request_id`).
 */
@Injectable()
export class RequestIdInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const ctx = context.switchToHttp();
    const request = ctx.getRequest<RequestWithId>();
    const response = ctx.getResponse<ResponseWithHeader>();

    const incoming = request.headers['x-request-id'];
    const requestId =
      typeof incoming === 'string' && incoming.trim().length > 0
        ? incoming.trim()
        : randomUUID();

    request.requestId = requestId;
    response.setHeader(REQUEST_ID_HEADER, requestId);

    return next.handle();
  }
}
