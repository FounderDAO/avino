import { describe, it, expect } from 'vitest';
import { getApiError, getApiErrorCode, isNetworkError } from './apiError';

const envelope = {
  status: 429,
  data: { error: { code: 'RATE_LIMITED', message: 'slow down' } },
} as const;

describe('getApiError', () => {
  it('extracts the error envelope', () => {
    expect(getApiError(envelope)).toEqual({ code: 'RATE_LIMITED', message: 'slow down' });
    expect(getApiErrorCode(envelope)).toBe('RATE_LIMITED');
  });

  it('returns null for a transport error without envelope', () => {
    expect(getApiError({ status: 'FETCH_ERROR', error: 'Failed to fetch' })).toBeNull();
  });
});

describe('isNetworkError', () => {
  it('is true for FETCH_ERROR (network/CORS failure)', () => {
    expect(isNetworkError({ status: 'FETCH_ERROR', error: 'Failed to fetch' })).toBe(true);
  });

  it('is true for TIMEOUT_ERROR', () => {
    expect(isNetworkError({ status: 'TIMEOUT_ERROR', error: 'timeout' })).toBe(true);
  });

  it('is true for a thrown SerializedError without HTTP status', () => {
    expect(isNetworkError({ name: 'TypeError', message: 'boom' })).toBe(true);
  });

  it('is false when a recognizable business code is present', () => {
    expect(isNetworkError(envelope)).toBe(false);
  });

  it('is false when there is no error', () => {
    expect(isNetworkError(undefined)).toBe(false);
  });
});
