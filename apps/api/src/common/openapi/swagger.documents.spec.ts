import { OpenAPIObject } from '@nestjs/swagger';
import { PUBLIC_PATH_PREFIXES, prunePublicPaths } from './swagger.documents';

function fakeDoc(paths: string[]): OpenAPIObject {
  return {
    openapi: '3.0.0',
    info: { title: 't', version: '1' },
    paths: Object.fromEntries(paths.map((p) => [p, {}])),
  } as unknown as OpenAPIObject;
}

describe('prunePublicPaths', () => {
  it('keeps only paths matching an allowed prefix', () => {
    const doc = fakeDoc([
      '/api/v1/listings',
      '/api/v1/admin/users',
      '/api/v1/roles',
      '/api/v1/search',
    ]);
    const pruned = prunePublicPaths(doc, ['/api/v1/listings', '/api/v1/search']);
    expect(Object.keys(pruned.paths).sort()).toEqual([
      '/api/v1/listings',
      '/api/v1/search',
    ]);
  });

  it('does not mutate the original document', () => {
    const doc = fakeDoc(['/api/v1/listings', '/api/v1/admin/users']);
    prunePublicPaths(doc, ['/api/v1/listings']);
    expect(Object.keys(doc.paths)).toContain('/api/v1/admin/users');
  });
});

describe('PUBLIC_PATH_PREFIXES', () => {
  it('never allows admin or roles routes', () => {
    expect(PUBLIC_PATH_PREFIXES.some((p) => p.includes('/admin'))).toBe(false);
    expect(PUBLIC_PATH_PREFIXES.includes('/api/v1/roles')).toBe(false);
  });

  it('uses the versioned /api/v1 base for every prefix', () => {
    for (const prefix of PUBLIC_PATH_PREFIXES) {
      expect(prefix.startsWith('/api/v1/')).toBe(true);
    }
  });
});
