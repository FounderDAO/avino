import { HttpException, NotFoundException } from '@nestjs/common';
import {
  Currency,
  Language,
  ListingStatus,
  PropertyType,
  TransactionType,
} from '@prisma/client';
import { ApiErrorCode } from '../common/dto/error-response.dto';
import { DistrictsService } from '../geo';
import { TranslationsService } from '../translations';
import { UploadsService } from '../uploads';
import { ListingsService } from './listings.service';
import { OwnerListingAction } from './dto/owner-status.dto';

/**
 * Юнит-тесты ListingsService.setOwnerStatus (owner hide/sold/rented/reactivate).
 * Prisma мокается; проверяются таблица переходов, smart-return и authz.
 */
describe('ListingsService.setOwnerStatus', () => {
  const OWNER_ID = 'u1';
  const LISTING_ID = '11111111-1111-1111-1111-111111111111';

  let prisma: any;
  let service: ListingsService;

  /** Базовая строка листинга владельца; кейсы переопределяют поля. */
  function row(over: Partial<Record<string, unknown>> = {}) {
    return {
      id: LISTING_ID,
      ownerId: OWNER_ID,
      status: ListingStatus.ACTIVE,
      transactionType: TransactionType.SALE,
      publishedAt: new Date('2026-06-10T08:00:00.000Z'),
      editedSinceHidden: false,
      ...over,
    };
  }

  /** Краткий ответ toResponse (LISTING_SELECT). */
  const updatedResponseRow = {
    id: LISTING_ID,
    status: ListingStatus.ARCHIVED,
    transactionType: TransactionType.SALE,
    propertyType: PropertyType.APARTMENT,
    originalLanguage: Language.RU,
    price: { toFixed: () => '100.00' },
    currency: Currency.UZS,
    createdAt: new Date('2026-06-02T08:00:00.000Z'),
  };

  beforeEach(() => {
    prisma = {
      listing: {
        findFirst: jest.fn(),
        update: jest.fn().mockResolvedValue(updatedResponseRow),
      },
    };
    const districts = {
      namesByIds: jest.fn(),
      pickName: jest.fn(),
    } as unknown as DistrictsService;
    const uploads = {
      resolveMediaUrl: jest.fn(),
    } as unknown as UploadsService;
    service = new ListingsService(
      prisma,
      new TranslationsService(prisma),
      districts,
      uploads,
    );
  });

  async function expectCode(promise: Promise<unknown>, code: ApiErrorCode) {
    await expect(promise).rejects.toBeInstanceOf(HttpException);
    try {
      await promise;
    } catch (e) {
      const res = (e as HttpException).getResponse() as { code: string };
      expect(res.code).toBe(code);
    }
  }

  /** Целевой статус из update-вызова (что сервис записал). */
  function writtenStatus(): ListingStatus {
    return prisma.listing.update.mock.calls[0][0].data.status;
  }
  function writtenData() {
    return prisma.listing.update.mock.calls[0][0].data;
  }

  it('HIDE active listing → ARCHIVED + resets edited flag', async () => {
    prisma.listing.findFirst.mockResolvedValue(row({ status: ListingStatus.ACTIVE }));
    await service.setOwnerStatus(OWNER_ID, LISTING_ID, OwnerListingAction.HIDE);
    expect(writtenStatus()).toBe(ListingStatus.ARCHIVED);
    expect(writtenData().editedSinceHidden).toBe(false);
  });

  it('HIDE pending (NEW) listing → ARCHIVED (withdraw from queue)', async () => {
    prisma.listing.findFirst.mockResolvedValue(row({ status: ListingStatus.NEW }));
    await service.setOwnerStatus(OWNER_ID, LISTING_ID, OwnerListingAction.HIDE);
    expect(writtenStatus()).toBe(ListingStatus.ARCHIVED);
  });

  it('MARK_SOLD a SALE listing → SOLD', async () => {
    prisma.listing.findFirst.mockResolvedValue(
      row({ status: ListingStatus.ACTIVE, transactionType: TransactionType.SALE }),
    );
    await service.setOwnerStatus(OWNER_ID, LISTING_ID, OwnerListingAction.MARK_SOLD);
    expect(writtenStatus()).toBe(ListingStatus.SOLD);
  });

  it('MARK_SOLD on a RENT listing → 422', async () => {
    prisma.listing.findFirst.mockResolvedValue(
      row({ transactionType: TransactionType.RENT }),
    );
    await expectCode(
      service.setOwnerStatus(OWNER_ID, LISTING_ID, OwnerListingAction.MARK_SOLD),
      ApiErrorCode.INVALID_STATUS_TRANSITION,
    );
  });

  it('MARK_RENTED a RENT listing → RENTED', async () => {
    prisma.listing.findFirst.mockResolvedValue(
      row({ status: ListingStatus.ACTIVE, transactionType: TransactionType.RENT }),
    );
    await service.setOwnerStatus(OWNER_ID, LISTING_ID, OwnerListingAction.MARK_RENTED);
    expect(writtenStatus()).toBe(ListingStatus.RENTED);
  });

  it('REACTIVATE archived + published + not edited → ACTIVE (smart return)', async () => {
    prisma.listing.findFirst.mockResolvedValue(
      row({
        status: ListingStatus.ARCHIVED,
        publishedAt: new Date('2026-06-10T08:00:00.000Z'),
        editedSinceHidden: false,
      }),
    );
    await service.setOwnerStatus(OWNER_ID, LISTING_ID, OwnerListingAction.REACTIVATE);
    expect(writtenStatus()).toBe(ListingStatus.ACTIVE);
    expect(writtenData().editedSinceHidden).toBe(false);
  });

  it('REACTIVATE archived but edited-while-hidden → NEW', async () => {
    prisma.listing.findFirst.mockResolvedValue(
      row({
        status: ListingStatus.ARCHIVED,
        publishedAt: new Date('2026-06-10T08:00:00.000Z'),
        editedSinceHidden: true,
      }),
    );
    await service.setOwnerStatus(OWNER_ID, LISTING_ID, OwnerListingAction.REACTIVATE);
    expect(writtenStatus()).toBe(ListingStatus.NEW);
  });

  it('REACTIVATE archived that was never published → NEW (no moderation bypass)', async () => {
    prisma.listing.findFirst.mockResolvedValue(
      row({ status: ListingStatus.ARCHIVED, publishedAt: null, editedSinceHidden: false }),
    );
    await service.setOwnerStatus(OWNER_ID, LISTING_ID, OwnerListingAction.REACTIVATE);
    expect(writtenStatus()).toBe(ListingStatus.NEW);
  });

  it('REACTIVATE a SOLD listing → NEW (always re-moderation)', async () => {
    prisma.listing.findFirst.mockResolvedValue(
      row({ status: ListingStatus.SOLD, publishedAt: new Date(), editedSinceHidden: false }),
    );
    await service.setOwnerStatus(OWNER_ID, LISTING_ID, OwnerListingAction.REACTIVATE);
    expect(writtenStatus()).toBe(ListingStatus.NEW);
  });

  it('HIDE an already SOLD listing → 422 (illegal source)', async () => {
    prisma.listing.findFirst.mockResolvedValue(row({ status: ListingStatus.SOLD }));
    await expectCode(
      service.setOwnerStatus(OWNER_ID, LISTING_ID, OwnerListingAction.HIDE),
      ApiErrorCode.INVALID_STATUS_TRANSITION,
    );
  });

  it("another user's listing → 403", async () => {
    prisma.listing.findFirst.mockResolvedValue(row({ ownerId: 'someone-else' }));
    await expectCode(
      service.setOwnerStatus(OWNER_ID, LISTING_ID, OwnerListingAction.HIDE),
      ApiErrorCode.FORBIDDEN,
    );
  });

  it('missing / DELETED listing → 404', async () => {
    prisma.listing.findFirst.mockResolvedValue(null);
    await expect(
      service.setOwnerStatus(OWNER_ID, LISTING_ID, OwnerListingAction.HIDE),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
