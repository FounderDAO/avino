import {
  ArgumentsHost,
  BadRequestException,
  HttpStatus,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { ApiErrorCode, ApiErrorResponse } from '../dto/error-response.dto';
import { REQUEST_ID_HEADER } from '../interceptors/request-id.interceptor';

jest.mock('@sentry/nestjs', () => ({
  captureException: jest.fn(),
}));

/**
 * Юнит-тесты глобального фильтра (TASK-023).
 *
 * Ключевой инвариант, который чуть не стоил входа по телефону: осознанный
 * доменный 5xx (503 AUTH_PROVIDER_UNAVAILABLE — канал/провайдер выключен) НЕ
 * должен превращаться в обобщённый «Internal server error», иначе клиент видит
 * пугающую ошибку вместо «выберите другой канал». При этом подлинные внутренние
 * сбои (raw Error / фреймворковый 5xx без доменного кода) обязаны и дальше
 * прятать внутренности.
 */
interface CapturedResponse {
  statusCode?: number;
  headers: Record<string, string>;
  body?: ApiErrorResponse;
}

function runFilter(
  exception: unknown,
  request: Record<string, unknown> = {
    method: 'POST',
    url: '/api/v1/auth/otp/request',
    requestId: 'req-test-1',
  },
): CapturedResponse {
  const captured: CapturedResponse = { headers: {} };
  const response = {
    setHeader(name: string, value: string): void {
      captured.headers[name] = value;
    },
    status(code: number) {
      captured.statusCode = code;
      return this;
    },
    json(body: unknown): unknown {
      captured.body = body as ApiErrorResponse;
      return body;
    },
  };
  const host = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;

  new AllExceptionsFilter().catch(exception, host);
  return captured;
}

describe('AllExceptionsFilter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('preserves a deliberate domain 5xx (503 AUTH_PROVIDER_UNAVAILABLE) instead of masking it', () => {
    const res = runFilter(
      new ServiceUnavailableException({
        code: ApiErrorCode.AUTH_PROVIDER_UNAVAILABLE,
        message: 'SMS channel is temporarily unavailable',
      }),
    );

    expect(res.statusCode).toBe(HttpStatus.SERVICE_UNAVAILABLE);
    expect(res.body?.error.code).toBe(ApiErrorCode.AUTH_PROVIDER_UNAVAILABLE);
    expect(res.body?.error.message).toBe('SMS channel is temporarily unavailable');
    expect(res.body?.error.request_id).toBe('req-test-1');
    expect(res.headers[REQUEST_ID_HEADER]).toBe('req-test-1');
  });

  it('masks a raw (non-HttpException) error as 500 INTERNAL_ERROR without leaking internals', () => {
    const res = runFilter(new Error('postgres://user:secret@db leaked'));

    expect(res.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(res.body?.error.code).toBe(ApiErrorCode.INTERNAL_ERROR);
    expect(res.body?.error.message).toBe('Internal server error');
  });

  it('masks a 5xx HttpException without a domain code (framework internal) as INTERNAL_ERROR', () => {
    const res = runFilter(new InternalServerErrorException('secret stack detail'));

    expect(res.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(res.body?.error.code).toBe(ApiErrorCode.INTERNAL_ERROR);
    expect(res.body?.error.message).toBe('Internal server error');
  });

  it('passes through a 4xx domain code with per-field details', () => {
    const res = runFilter(
      new BadRequestException({
        code: ApiErrorCode.VALIDATION_ERROR,
        message: 'Invalid destination for the selected channel',
        details: [{ field: 'destination', issue: 'must be a valid email address' }],
      }),
    );

    expect(res.statusCode).toBe(HttpStatus.BAD_REQUEST);
    expect(res.body?.error.code).toBe(ApiErrorCode.VALIDATION_ERROR);
    expect(res.body?.error.details?.[0]?.field).toBe('destination');
  });

  // ── Sentry (ADR-0129): в error tracking летят ТОЛЬКО подлинные внутренние
  //    сбои — тот же критерий, что и для error-лога. ─────────────────────────
  it('reports a raw internal error to Sentry with the request id', () => {
    const boom = new Error('unexpected null');
    runFilter(boom);

    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    expect(Sentry.captureException).toHaveBeenCalledWith(
      boom,
      expect.objectContaining({ tags: { request_id: 'req-test-1' } }),
    );
  });

  it('does NOT report deliberate domain 5xx or 4xx to Sentry', () => {
    runFilter(
      new ServiceUnavailableException({
        code: ApiErrorCode.AUTH_PROVIDER_UNAVAILABLE,
        message: 'SMS channel is temporarily unavailable',
      }),
    );
    runFilter(new BadRequestException('bad payload'));

    expect(Sentry.captureException).not.toHaveBeenCalled();
  });
});
