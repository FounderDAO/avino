import { Currency, Language, ListingStatus, Prisma } from '@prisma/client';
import {
  applyPublishedVersion,
  capturePublishedVersion,
  toPublishedVersionData,
} from './published-version';

/**
 * SEO AUD-9: копия одобренной версии — сериализация в JSON и наложение на
 * живую строку для публичной карточки.
 */
describe('published version', () => {
  const approvedRow = {
    price: new Prisma.Decimal('4500000.00'),
    area: new Prisma.Decimal('62.50'),
    lotArea: null,
    bathrooms: new Prisma.Decimal('1.5'),
    latitude: new Prisma.Decimal('41.311081'),
    longitude: new Prisma.Decimal('69.240562'),
    address: 'Yunusobod 12',
    districtId: 'd1',
    contentUpdatedAt: new Date('2026-06-05T09:00:00.000Z'),
    translations: [{ language: Language.RU, title: 'Одобрено' }],
    media: [{ id: 'm2' }, { id: 'm1' }, { id: 'm-gone' }],
    priceHistory: [
      {
        price: new Prisma.Decimal('4500000.00'),
        currency: Currency.UZS,
        createdAt: new Date('2026-06-01T10:00:00.000Z'),
      },
    ],
  };

  const live = {
    id: 'L1',
    status: ListingStatus.NEW as ListingStatus,
    viewsCount: 40,
    price: new Prisma.Decimal('9900000.00'),
    area: new Prisma.Decimal('70.00'),
    lotArea: null as Prisma.Decimal | null,
    bathrooms: null as Prisma.Decimal | null,
    latitude: null as Prisma.Decimal | null,
    longitude: null as Prisma.Decimal | null,
    address: 'Chilonzor 5',
    districtId: 'd2',
    contentUpdatedAt: new Date('2026-11-20T08:00:00.000Z'),
    translations: [{ language: Language.RU, title: 'Правка' }],
    media: [
      { id: 'm1', url: 'one' },
      { id: 'm2', url: 'two' },
      { id: 'm-new', url: 'new' },
    ],
    priceHistory: [
      {
        price: new Prisma.Decimal('9900000.00'),
        currency: Currency.UZS,
        createdAt: new Date('2026-11-20T08:00:00.000Z'),
      },
    ],
  };

  it('stores decimals as strings and dates as ISO (JSON-safe)', () => {
    const data = toPublishedVersionData(approvedRow as any);

    expect(data).toMatchObject({
      price: '4500000',
      area: '62.5',
      lotArea: null,
      bathrooms: '1.5',
      contentUpdatedAt: '2026-06-05T09:00:00.000Z',
      mediaIds: ['m2', 'm1', 'm-gone'],
      priceHistory: [
        { price: '4500000', currency: Currency.UZS, createdAt: '2026-06-01T10:00:00.000Z' },
      ],
    });
    expect(JSON.parse(JSON.stringify(data))).toEqual(data);
  });

  it('rebuilds the approved card over the live row after a JSON round trip', () => {
    const data = JSON.parse(JSON.stringify(toPublishedVersionData(approvedRow as any)));

    const result = applyPublishedVersion(live, data);

    expect(result.status).toBe(ListingStatus.ACTIVE);
    expect(result.price.toFixed(2)).toBe('4500000.00');
    expect(result.latitude?.toFixed(6)).toBe('41.311081');
    expect(result.address).toBe('Yunusobod 12');
    expect(result.districtId).toBe('d1');
    expect(result.translations).toEqual([{ language: Language.RU, title: 'Одобрено' }]);
    expect(result.contentUpdatedAt).toEqual(new Date('2026-06-05T09:00:00.000Z'));
    // Одобренный порядок; удалённое фото пропало, новое не показано.
    expect(result.media.map((m) => m.url)).toEqual(['two', 'one']);
    expect(result.priceHistory).toEqual([
      {
        price: new Prisma.Decimal('4500000'),
        currency: Currency.UZS,
        createdAt: new Date('2026-06-01T10:00:00.000Z'),
      },
    ]);
    // Поля вне модерации — живые.
    expect(result.viewsCount).toBe(40);
    expect(result.id).toBe('L1');
  });

  describe('capturePublishedVersion', () => {
    const db = () => ({
      listing: { findUnique: jest.fn().mockResolvedValue(approvedRow) },
      listingPublishedVersion: { upsert: jest.fn().mockResolvedValue({}) },
    });

    it('copies an ACTIVE listing (upsert: the approved content may have changed)', async () => {
      const d = db();

      await capturePublishedVersion(d as any, 'L1', ListingStatus.ACTIVE);

      const args = d.listingPublishedVersion.upsert.mock.calls[0][0];
      expect(args.where).toEqual({ listingId: 'L1' });
      expect(args.create).toEqual({ listingId: 'L1', data: toPublishedVersionData(approvedRow as any) });
      expect(args.update).toEqual({ data: args.create.data, capturedAt: expect.any(Date) });
    });

    it.each([ListingStatus.REJECTED, ListingStatus.NEW, ListingStatus.DRAFT])(
      'does nothing for %s (its content is not approved, or the copy already exists)',
      async (status) => {
        const d = db();

        await capturePublishedVersion(d as any, 'L1', status);

        expect(d.listing.findUnique).not.toHaveBeenCalled();
        expect(d.listingPublishedVersion.upsert).not.toHaveBeenCalled();
      },
    );

    it('does nothing when the listing is gone', async () => {
      const d = db();
      d.listing.findUnique.mockResolvedValue(null);

      await capturePublishedVersion(d as any, 'L1', ListingStatus.ACTIVE);

      expect(d.listingPublishedVersion.upsert).not.toHaveBeenCalled();
    });
  });
});
