import { Currency, Language, ListingStatus, PropertyType, TransactionType } from '@prisma/client';
import { AddressResolverService, DistrictsService } from '../geo';
import { PrismaService } from '../prisma';
import { ActiveListingLimitService } from '../settings';
import { TranslationsService } from '../translations';
import { UploadsService } from '../uploads';
import { CreateListingDto } from './dto/create-listing.dto';
import { ListingsService } from './listings.service';

describe('ListingsService.buildCreateData / createInTransaction', () => {
  const resolve = jest.fn();
  const amenityFindMany = jest.fn();
  const prisma = { amenity: { findMany: amenityFindMany } } as unknown as PrismaService;
  const service = new ListingsService(
    prisma,
    new TranslationsService(prisma),
    {} as DistrictsService,
    {} as UploadsService,
    {} as ActiveListingLimitService,
    { resolve } as unknown as AddressResolverService,
  );

  const dto = {
    transaction_type: TransactionType.SALE,
    property_type: PropertyType.APARTMENT,
    original_language: Language.RU,
    price: '85000.50',
    currency: Currency.USD,
    area: '55',
    address: 'Узбекистан, Ташкент, улица Навои, 12',
    latitude: '41.31',
    longitude: '69.24',
    translation: { title: 'Квартира' },
  } as CreateListingDto;

  beforeEach(() => jest.clearAllMocks());

  it('geocode: false — не зовёт геокодер, адрес нормализуется строкой', async () => {
    const data = await service.buildCreateData(dto, { geocode: false });
    expect(resolve).not.toHaveBeenCalled();
    expect(data.status).toBe(ListingStatus.NEW);
    expect(data.address).toBe('Ташкент, ул. Навои, 12');
    expect(data).not.toHaveProperty('ownerId');
    expect(data.latitude).toBe('41.31');
  });

  it('geocode: true — адрес берётся из геокодера', async () => {
    resolve.mockResolvedValue({ address: 'ул. Навои, 12', addressEn: 'Navoi St, 12' });
    const data = await service.buildCreateData(dto, { geocode: true });
    expect(data.address).toBe('ул. Навои, 12');
    expect(data.addressEn).toBe('Navoi St, 12');
  });

  it('неизвестное удобство → 422', async () => {
    amenityFindMany.mockResolvedValue([]);
    await expect(
      service.buildCreateData({ ...dto, amenities: ['nope'] } as CreateListingDto, { geocode: false }),
    ).rejects.toMatchObject({ status: 422 });
  });

  it('createInTransaction: роль, объявление с ownerId, история цены', async () => {
    const tx = {
      userRole: { count: jest.fn().mockResolvedValue(1), upsert: jest.fn() },
      role: { findUnique: jest.fn() },
      listing: { create: jest.fn().mockResolvedValue({ id: 'L1' }) },
      listingPriceHistory: { create: jest.fn() },
    };
    const data = await service.buildCreateData(dto, { geocode: false });
    const created = await service.createInTransaction(tx as never, 'U1', data, dto);
    expect(created.id).toBe('L1');
    expect(tx.listing.create.mock.calls[0][0].data.ownerId).toBe('U1');
    expect(tx.listingPriceHistory.create).toHaveBeenCalledWith({
      data: { listingId: 'L1', price: '85000.50', currency: Currency.USD },
    });
  });
});
