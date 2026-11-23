import { HEADERS_METADATA } from '@nestjs/common/constants';
import { AgentsController } from '../../agents/agents.controller';
import { GeoController } from '../../geo/geo.controller';
import { AGENTS_CACHE_CONTROL, GEO_CACHE_CONTROL } from './cache-control';

const cacheHeader = (handler: unknown) =>
  (Reflect.getMetadata(HEADERS_METADATA, handler as object) as { name: string; value: string }[] | undefined)?.find(
    (h) => h.name === 'Cache-Control',
  )?.value;

describe('public Cache-Control (SEO)', () => {
  it('geo dictionaries are cached for a day', () => {
    expect(cacheHeader(GeoController.prototype.listDistricts)).toBe(GEO_CACHE_CONTROL);
    expect(cacheHeader(GeoController.prototype.listRegions)).toBe(GEO_CACHE_CONTROL);
  });

  it('agents are cached briefly (presigned avatars live 1 h)', () => {
    expect(cacheHeader(AgentsController.prototype.list)).toBe(AGENTS_CACHE_CONTROL);
    expect(cacheHeader(AgentsController.prototype.getById)).toBe(AGENTS_CACHE_CONTROL);
    expect(AGENTS_CACHE_CONTROL).toMatch(/max-age=300\b/);
  });
});
