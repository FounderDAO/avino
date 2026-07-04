import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { ApiErrorToasts } from './ApiErrorToasts';
import { emitApiError } from '@/lib/apiErrorToastBus';

const toastError = vi.hoisted(() => vi.fn());
vi.mock('sonner', () => ({
  toast: { error: toastError, success: vi.fn() },
}));

// next-intl's real runtime тянет next/navigation (не резолвится в vitest).
// Мокаем useTranslations резолвером по настоящему messages/ru.json.
vi.mock('next-intl', async () => {
  const ru = (await import('../../messages/ru.json')).default as Record<
    string,
    unknown
  >;
  const useTranslations =
    (ns: string) =>
    (key: string): string => {
      const root = (ns ? ru[ns] : ru) as Record<string, unknown>;
      const val = key
        .split('.')
        .reduce<unknown>(
          (o, k) =>
            o && typeof o === 'object'
              ? (o as Record<string, unknown>)[k]
              : undefined,
          root,
        );
      return typeof val === 'string' ? val : key;
    };
  return { useTranslations };
});

const RU = (await import('../../messages/ru.json')).default.toasts;

describe('ApiErrorToasts', () => {
  beforeEach(() => {
    toastError.mockClear();
  });

  it('известный код → специфичный текст', () => {
    render(<ApiErrorToasts />);
    emitApiError({
      endpointName: 'x',
      error: {
        status: 429,
        data: { error: { code: 'RATE_LIMITED', message: 'slow down' } },
      },
    });
    expect(toastError).toHaveBeenCalledWith(RU.rateLimited);
  });

  it('сетевой сбой → networkError', () => {
    render(<ApiErrorToasts />);
    emitApiError({
      endpointName: 'x',
      error: { status: 'FETCH_ERROR', error: 'failed to fetch' },
    });
    expect(toastError).toHaveBeenCalledWith(RU.networkError);
  });

  it('неизвестный бизнес-код → genericError', () => {
    render(<ApiErrorToasts />);
    emitApiError({
      endpointName: 'x',
      error: {
        status: 500,
        data: { error: { code: 'SOMETHING_NEW', message: 'boom' } },
      },
    });
    expect(toastError).toHaveBeenCalledWith(RU.genericError);
  });

  it('после размонтирования не тостит', () => {
    const { unmount } = render(<ApiErrorToasts />);
    unmount();
    emitApiError({ endpointName: 'x', error: { status: 500, data: {} } });
    expect(toastError).not.toHaveBeenCalled();
  });
});
