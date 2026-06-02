import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  ApiErrorBody,
  ApiErrorCode,
  ApiErrorDetail,
  ApiErrorResponse,
} from '../dto/error-response.dto';
import { REQUEST_ID_HEADER } from '../interceptors/request-id.interceptor';

/**
 * Минимальные структурные типы request/response — без `@types/express`.
 * `requestId` проставляет {@link RequestIdInterceptor}.
 */
interface RequestLike {
  method?: string;
  url?: string;
  requestId?: string;
  headers?: Record<string, string | string[] | undefined>;
}

interface ResponseLike {
  setHeader(name: string, value: string): void;
  status(code: number): ResponseLike;
  json(body: unknown): unknown;
}

/** Маппинг HTTP-статусов, бросаемых фреймворком, на стабильные коды (API.md §17). */
const STATUS_TO_CODE: Partial<Record<number, ApiErrorCode>> = {
  [HttpStatus.BAD_REQUEST]: ApiErrorCode.VALIDATION_ERROR,
  [HttpStatus.UNAUTHORIZED]: ApiErrorCode.UNAUTHORIZED,
  [HttpStatus.FORBIDDEN]: ApiErrorCode.FORBIDDEN,
  [HttpStatus.NOT_FOUND]: ApiErrorCode.NOT_FOUND,
  [HttpStatus.PAYLOAD_TOO_LARGE]: ApiErrorCode.FILE_TOO_LARGE,
  [HttpStatus.UNSUPPORTED_MEDIA_TYPE]: ApiErrorCode.UNSUPPORTED_MEDIA_TYPE,
  [HttpStatus.TOO_MANY_REQUESTS]: ApiErrorCode.RATE_LIMITED,
  [HttpStatus.INTERNAL_SERVER_ERROR]: ApiErrorCode.INTERNAL_ERROR,
};

/**
 * Глобальный фильтр исключений (TASK-023).
 *
 * Любое исключение отдаётся клиенту в едином error-envelope (docs/API.md §4):
 * `{ "error": { code, message, details?, request_id } }`.
 *
 * Гарантии:
 * - Доменный код может бросить `HttpException` со структурой
 *   `{ code, message, details }` — фильтр возьмёт их напрямую.
 * - Иначе `code` выводится из HTTP-статуса (см. {@link STATUS_TO_CODE}).
 * - Любая необработанная (не-`HttpException`) ошибка → `500 INTERNAL_ERROR`
 *   с обобщённым сообщением; внутренности (stack, текст) пишутся только в лог
 *   и наружу не утекают.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<RequestLike>();
    const response = ctx.getResponse<ResponseLike>();

    // Приоритет: id, проставленный интерсептором → входящий заголовок (на путях,
    // где интерсептор не отработал: not-found, отказ guard) → новый UUID.
    const requestId =
      request.requestId ?? this.incomingRequestId(request) ?? randomUUID();
    const { status, body } = this.buildError(exception, requestId);

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      // Полную причину пишем только в серверный лог (наружу — обобщённое сообщение).
      this.logger.error(
        `${request.method ?? '-'} ${request.url ?? '-'} → ${status} [${requestId}]`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.setHeader(REQUEST_ID_HEADER, requestId);
    const payload: ApiErrorResponse = { error: body };
    response.status(status).json(payload);
  }

  private buildError(
    exception: unknown,
    requestId: string,
  ): { status: number; body: ApiErrorBody } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const res = exception.getResponse();

      // 5xx через HttpException тоже не должен раскрывать внутренности.
      if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
        return {
          status,
          body: {
            code: ApiErrorCode.INTERNAL_ERROR,
            message: 'Internal server error',
            request_id: requestId,
          },
        };
      }

      const code = this.resolveCode(status, res);
      const message = this.resolveMessage(res, exception.message);
      const details = this.resolveDetails(res);
      return {
        status,
        body: {
          code,
          message,
          ...(details ? { details } : {}),
          request_id: requestId,
        },
      };
    }

    // Неизвестная ошибка → 500 без утечки внутренностей.
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: {
        code: ApiErrorCode.INTERNAL_ERROR,
        message: 'Internal server error',
        request_id: requestId,
      },
    };
  }

  /** Берёт явный `code` из payload, иначе выводит из статуса (с graceful fallback). */
  private resolveCode(status: number, res: string | object): string {
    if (this.isRecord(res) && typeof res.code === 'string') {
      return res.code;
    }
    const mapped = STATUS_TO_CODE[status];
    if (mapped) {
      return mapped;
    }
    // Стабильный fallback из имени HTTP-статуса (например, 409 → "CONFLICT").
    const reason = HttpStatus[status];
    return typeof reason === 'string' ? reason : ApiErrorCode.INTERNAL_ERROR;
  }

  /** Достаёт человекочитаемое сообщение, схлопывая массив сообщений Nest по умолчанию. */
  private resolveMessage(res: string | object, fallback: string): string {
    if (typeof res === 'string') {
      return res;
    }
    if (this.isRecord(res)) {
      const message = res.message;
      if (typeof message === 'string') {
        return message;
      }
      if (Array.isArray(message) && message.length > 0) {
        return message.join('; ');
      }
    }
    return fallback;
  }

  /** Достаёт пер-полевые `details`, если их положил exceptionFactory/доменный код. */
  private resolveDetails(res: string | object): ApiErrorDetail[] | undefined {
    if (this.isRecord(res) && Array.isArray(res.details)) {
      return res.details as ApiErrorDetail[];
    }
    return undefined;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  /** Входящий `X-Request-Id` (от прокси/клиента), если есть и не пуст. */
  private incomingRequestId(request: RequestLike): string | undefined {
    const incoming = request.headers?.['x-request-id'];
    return typeof incoming === 'string' && incoming.trim().length > 0
      ? incoming.trim()
      : undefined;
  }
}
