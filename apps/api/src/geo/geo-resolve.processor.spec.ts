import { ListingStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ListingUrlSyncQueue } from '../queues/listing-url-sync.queue';
import { AddressResolverService } from './address-resolver.service';
import { GeoResolveProcessor } from './geo-resolve.processor';

const ID = '3c2e8ab9-7480-4ebd-aef4-4be20d8d0019';

function setup(listing: Record<string, unknown> | null, resolved: { districtId: string | null } | null, updatedCount = 1) {
  const prisma = {
    listing: {
      findUnique: jest.fn().mockResolvedValue(listing),
      updateMany: jest.fn().mockResolvedValue({ count: updatedCount }),
    },
  };
  const resolver = { resolveDistrictId: jest.fn().mockResolvedValue(resolved) };
  const urlSync = { enqueue: jest.fn().mockResolvedValue(undefined) };
  const processor = new GeoResolveProcessor(
    prisma as unknown as PrismaService,
    resolver as unknown as AddressResolverService,
    urlSync as unknown as ListingUrlSyncQueue,
  );
  return { processor, prisma, resolver, urlSync };
}

const point = {
  districtId: null,
  latitude: new Prisma.Decimal('41.340000'),
  longitude: new Prisma.Decimal('69.285000'),
  status: ListingStatus.ACTIVE,
};

describe('GeoResolveProcessor (SEO AUD-2)', () => {
  it('writes the district only if still missing, moves the content date and syncs the page', async () => {
    const { processor, prisma, resolver, urlSync } = setup(point, { districtId: 'd-yun' });
    await processor.process(ID, false);
    expect(resolver.resolveDistrictId).toHaveBeenCalledWith('41.34', '69.285');
    expect(prisma.listing.updateMany).toHaveBeenCalledWith({
      where: { id: ID, districtId: null },
      data: { districtId: 'd-yun', contentUpdatedAt: expect.any(Date) },
    });
    expect(urlSync.enqueue).toHaveBeenCalledWith([ID]);
  });

  it('throws (BullMQ retries) when the geocoder is unavailable', async () => {
    const { processor, prisma } = setup(point, null);
    await expect(processor.process(ID, false)).rejects.toThrow('Geocoder unavailable');
    expect(prisma.listing.updateMany).not.toHaveBeenCalled();
  });

  it('gives up without retry when the point has no dictionary district', async () => {
    const { processor, prisma, urlSync } = setup(point, { districtId: null });
    await expect(processor.process(ID, false)).resolves.toBeUndefined();
    expect(prisma.listing.updateMany).not.toHaveBeenCalled();
    expect(urlSync.enqueue).not.toHaveBeenCalled();
  });

  it.each([
    ['listing is gone', null],
    ['district already set', { ...point, districtId: 'd1' }],
    ['no coordinates', { ...point, latitude: null }],
    ['listing deleted', { ...point, status: ListingStatus.DELETED }],
  ])('skips when %s', async (_label, listing) => {
    const { processor, resolver } = setup(listing as Record<string, unknown> | null, { districtId: 'd-yun' });
    await processor.process(ID, false);
    expect(resolver.resolveDistrictId).not.toHaveBeenCalled();
  });

  it('does not sync when another writer set the district first', async () => {
    const { processor, urlSync } = setup(point, { districtId: 'd-yun' }, 0);
    await processor.process(ID, false);
    expect(urlSync.enqueue).not.toHaveBeenCalled();
  });
});
