import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// __dirname = apps/api/src/common/openapi → три уровня вверх = apps/api.
const apiRoot = join(__dirname, '..', '..', '..');
const publicDoc = JSON.parse(
  readFileSync(join(apiRoot, 'openapi.public.json'), 'utf8'),
);
const internalDoc = JSON.parse(
  readFileSync(join(apiRoot, 'openapi.internal.json'), 'utf8'),
);

describe('OpenAPI public contract', () => {
  it('is a valid OpenAPI 3 document with at least one path', () => {
    expect(publicDoc.openapi).toMatch(/^3\./);
    expect(Object.keys(publicDoc.paths).length).toBeGreaterThan(0);
  });

  it('exposes only versioned /api/v1 paths', () => {
    for (const route of Object.keys(publicDoc.paths)) {
      expect(route.startsWith('/api/v1/')).toBe(true);
    }
  });

  it('never exposes admin or roles routes', () => {
    const routes = Object.keys(publicDoc.paths);
    expect(routes.some((r) => r.startsWith('/api/v1/admin'))).toBe(false);
    expect(routes.some((r) => r.startsWith('/api/v1/roles'))).toBe(false);
  });

  it('declares the bearer security scheme', () => {
    expect(publicDoc.components.securitySchemes.bearer).toBeDefined();
  });

  it('includes the error-envelope schema', () => {
    expect(publicDoc.components.schemas.ErrorResponseDto).toBeDefined();
  });
});

describe('OpenAPI internal contract', () => {
  it('exposes admin routes', () => {
    const routes = Object.keys(internalDoc.paths);
    expect(routes.some((r) => r.startsWith('/api/v1/admin'))).toBe(true);
  });
});
