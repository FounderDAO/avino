import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveApiBase } from './base';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('resolveApiBase — server-side API base', () => {
  it('предпочитает API_INTERNAL_URL (Docker service name) для SSR', () => {
    vi.stubEnv('API_INTERNAL_URL', 'http://api:4000');
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', 'http://localhost:4000');
    expect(resolveApiBase()).toBe('http://api:4000/api/v1');
  });

  it('без API_INTERNAL_URL падает на публичный NEXT_PUBLIC_API_BASE_URL (host-dev/браузер)', () => {
    vi.stubEnv('API_INTERNAL_URL', '');
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', 'https://api.avino.uz');
    expect(resolveApiBase()).toBe('https://api.avino.uz/api/v1');
  });

  it('без обеих переменных — дефолт http://localhost:4000', () => {
    vi.stubEnv('API_INTERNAL_URL', '');
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', '');
    expect(resolveApiBase()).toBe('http://localhost:4000/api/v1');
  });
});
