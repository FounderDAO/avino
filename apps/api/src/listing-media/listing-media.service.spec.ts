import { HttpException } from '@nestjs/common';
import { ListingStatus, MediaType } from '@prisma/client';
import { UserRole } from '@avino/shared';
import { ApiErrorCode } from '../common/dto/error-response.dto';
import { AuthenticatedUser } from '../common/guards';
import {
  ListingMediaService,
  UploadedImageFile,
} from './listing-media.service';

/**
 * Юнит-тесты ListingMediaService (TASK-061). Prisma и UploadsService мокаются —
 * проверяются: ownership/visibility-гейты (403/404), allow-list MIME (415),
 * лимит размера (413) и количества (422), proxy-загрузка в S3 + создание записи,
 * удаление с best-effort S3-очисткой и переупорядочивание как полная перестановка.
 */
describe('ListingMediaService', () => {
  const OWNER_ID = 'u-owner';
  const LISTING_ID = '11111111-1111-1111-1111-111111111111';
  const M1 = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
  const M2 = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';

  const owner: AuthenticatedUser = { id: OWNER_ID, roles: [UserRole.OWNER] };
  const admin: AuthenticatedUser = { id: 'u-admin', roles: [UserRole.ADMIN] };
  const stranger: AuthenticatedUser = { id: 'u-x', roles: [UserRole.USER] };

  let prisma: any;
  let uploads: any;
  let service: ListingMediaService;

  function makeFile(
    overrides: Partial<UploadedImageFile> = {},
  ): UploadedImageFile {
    return {
      buffer: Buffer.from('img'),
      mimetype: 'image/webp',
      originalname: 'front.webp',
      size: 1024,
      ...overrides,
    };
  }

  function mockListing(over: Partial<{ ownerId: string; status: ListingStatus }> = {}) {
    prisma.listing.findUnique.mockResolvedValue({
      ownerId: OWNER_ID,
      status: ListingStatus.ACTIVE,
      ...over,
    });
  }

  beforeEach(() => {
    prisma = {
      listing: { findUnique: jest.fn() },
      listingMedia: {
        count: jest.fn(),
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        delete: jest.fn(),
        update: jest.fn((args) => args),
      },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    uploads = {
      upload: jest.fn().mockResolvedValue({
        key: 'listings/x/media/u.webp',
        url: 'https://cdn.avino.uz/listings/x/media/u.webp',
      }),
      delete: jest.fn().mockResolvedValue(undefined),
      extractKey: jest.fn().mockReturnValue('listings/x/media/u.webp'),
      // back-compat: пустой префикс → ключи остаются `listings/...`
      rootPrefix: jest.fn().mockReturnValue(''),
      // Отдача всегда идёт через свежий presigned URL (ADR-0086): по умолчанию
      // echo (key ?? fallbackUrl), чтобы не-URL-тесты остались зелёными; тесты на
      // протухание переопределяют возврат.
      resolveMediaUrl: jest.fn((key: string | null | undefined, url: string) =>
        Promise.resolve(key ?? url),
      ),
    };
    service = new ListingMediaService(prisma, uploads);
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

  describe('list', () => {
    it('returns media ordered by sort_order for an ACTIVE listing (public)', async () => {
      mockListing();
      prisma.listingMedia.findMany.mockResolvedValue([
        { id: M1, url: 'a', thumbnailUrl: null, sortOrder: 0, type: MediaType.IMAGE },
        { id: M2, url: 'b', thumbnailUrl: 't', sortOrder: 1, type: MediaType.IMAGE },
      ]);

      const result = await service.list(LISTING_ID, undefined);

      expect(prisma.listingMedia.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { listingId: LISTING_ID },
          orderBy: { sortOrder: 'asc' },
        }),
      );
      expect(result).toEqual([
        { id: M1, url: 'a', thumbnail_url: null, sort_order: 0, type: 'IMAGE' },
        { id: M2, url: 'b', thumbnail_url: 't', sort_order: 1, type: 'IMAGE' },
      ]);
    });

    it('re-signs media URL at read time and never serves the stored (expired) url (ADR-0086)', async () => {
      mockListing();
      // В БД лежит протухший presigned URL и стабильный key. Read-path обязан
      // перевыпустить ссылку из key, а не отдать сохранённое значение.
      prisma.listingMedia.findMany.mockResolvedValue([
        {
          id: M1,
          url: 'https://r2.example/avinodev/listings/x/media/u.webp?X-Amz-Expires=3600&expired=yes',
          storageKey: 'listings/x/media/u.webp',
          thumbnailUrl: null,
          sortOrder: 0,
          type: MediaType.IMAGE,
        },
      ]);
      uploads.resolveMediaUrl.mockResolvedValue(
        'https://r2.example/avinodev/listings/x/media/u.webp?X-Amz-Signature=FRESH',
      );

      const [media] = await service.list(LISTING_ID, undefined);

      expect(uploads.resolveMediaUrl).toHaveBeenCalledWith(
        'listings/x/media/u.webp',
        expect.stringContaining('expired=yes'),
      );
      expect(media.url).toBe(
        'https://r2.example/avinodev/listings/x/media/u.webp?X-Amz-Signature=FRESH',
      );
      expect(media.url).not.toContain('expired=yes');
    });

    it('hides media of a non-ACTIVE listing from a guest (404)', async () => {
      mockListing({ status: ListingStatus.NEW });
      await expectCode(service.list(LISTING_ID, undefined), ApiErrorCode.NOT_FOUND);
    });

    it('lets the owner view media of a non-ACTIVE listing', async () => {
      mockListing({ status: ListingStatus.DRAFT });
      prisma.listingMedia.findMany.mockResolvedValue([]);
      await expect(service.list(LISTING_ID, owner)).resolves.toEqual([]);
    });

    it('returns 404 for a DELETED listing even to the owner', async () => {
      mockListing({ status: ListingStatus.DELETED });
      await expectCode(service.list(LISTING_ID, owner), ApiErrorCode.NOT_FOUND);
    });
  });

  describe('uploadFile', () => {
    it('uploads to S3 and creates a media row appended at the end', async () => {
      mockListing();
      prisma.listingMedia.count.mockResolvedValue(2);
      prisma.listingMedia.create.mockResolvedValue({
        id: M1,
        url: 'https://cdn.avino.uz/listings/x/media/u.webp',
        thumbnailUrl: null,
        sortOrder: 2,
        type: MediaType.IMAGE,
      });

      const result = await service.uploadFile(LISTING_ID, owner, makeFile());

      expect(uploads.upload).toHaveBeenCalledWith(
        expect.objectContaining({
          contentType: 'image/webp',
          prefix: `listings/${LISTING_ID}/media`,
          extension: '.webp',
        }),
      );
      expect(prisma.listingMedia.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            listingId: LISTING_ID,
            sortOrder: 2,
            type: MediaType.IMAGE,
            mimeType: 'image/webp',
            sizeBytes: 1024,
          }),
        }),
      );
      expect(result.sort_order).toBe(2);
      expect(result.thumbnail_url).toBeNull();
    });

    it('includes the env prefix in the S3 upload path when rootPrefix returns "dev"', async () => {
      // Локальный override: rootPrefix → 'dev', сбрасываем после теста
      uploads.rootPrefix.mockReturnValue('dev');
      try {
        mockListing();
        prisma.listingMedia.count.mockResolvedValue(0);
        prisma.listingMedia.create.mockResolvedValue({
          id: M1,
          url: 'https://cdn.avino.uz/dev/listings/x/media/u.webp',
          thumbnailUrl: null,
          sortOrder: 0,
          type: MediaType.IMAGE,
        });

        await service.uploadFile(LISTING_ID, owner, makeFile());

        expect(uploads.upload).toHaveBeenCalledWith(
          expect.objectContaining({
            prefix: `dev/listings/${LISTING_ID}/media`,
          }),
        );
      } finally {
        uploads.rootPrefix.mockReturnValue('');
      }
    });

    it("lets an ADMIN upload to someone else's listing", async () => {
      mockListing();
      prisma.listingMedia.count.mockResolvedValue(0);
      prisma.listingMedia.create.mockResolvedValue({
        id: M1, url: 'u', thumbnailUrl: null, sortOrder: 0, type: MediaType.IMAGE,
      });
      await expect(
        service.uploadFile(LISTING_ID, admin, makeFile()),
      ).resolves.toBeDefined();
    });

    it('rejects a stranger with 403', async () => {
      mockListing();
      await expectCode(
        service.uploadFile(LISTING_ID, stranger, makeFile()),
        ApiErrorCode.FORBIDDEN,
      );
      expect(uploads.upload).not.toHaveBeenCalled();
    });

    it('rejects a missing file with 400', async () => {
      mockListing();
      await expectCode(
        service.uploadFile(LISTING_ID, owner, undefined),
        ApiErrorCode.VALIDATION_ERROR,
      );
    });

    it('rejects a disallowed MIME type with 415', async () => {
      mockListing();
      await expectCode(
        service.uploadFile(LISTING_ID, owner, makeFile({ mimetype: 'image/gif' })),
        ApiErrorCode.UNSUPPORTED_MEDIA_TYPE,
      );
    });

    it('rejects an oversized file with 413', async () => {
      mockListing();
      await expectCode(
        service.uploadFile(
          LISTING_ID,
          owner,
          makeFile({ size: 11 * 1024 * 1024 }),
        ),
        ApiErrorCode.FILE_TOO_LARGE,
      );
    });

    it('rejects upload over the media limit with 422', async () => {
      mockListing();
      prisma.listingMedia.count.mockResolvedValue(20);
      await expectCode(
        service.uploadFile(LISTING_ID, owner, makeFile()),
        ApiErrorCode.MEDIA_LIMIT_EXCEEDED,
      );
      expect(uploads.upload).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('deletes the DB row then the S3 object', async () => {
      mockListing();
      prisma.listingMedia.findFirst.mockResolvedValue({
        id: M1,
        url: 'https://cdn.avino.uz/listings/x/media/u.webp',
      });

      await service.remove(LISTING_ID, owner, M1);

      expect(prisma.listingMedia.delete).toHaveBeenCalledWith({
        where: { id: M1 },
      });
      expect(uploads.extractKey).toHaveBeenCalledWith(
        'https://cdn.avino.uz/listings/x/media/u.webp',
      );
      expect(uploads.delete).toHaveBeenCalledWith('listings/x/media/u.webp');
    });

    it('swallows an S3 delete error (DB row is source of truth)', async () => {
      mockListing();
      prisma.listingMedia.findFirst.mockResolvedValue({ id: M1, url: 'u' });
      uploads.delete.mockRejectedValue(new Error('s3 down'));
      await expect(service.remove(LISTING_ID, owner, M1)).resolves.toBeUndefined();
      expect(prisma.listingMedia.delete).toHaveBeenCalled();
    });

    it('returns 404 when the media does not belong to the listing', async () => {
      mockListing();
      prisma.listingMedia.findFirst.mockResolvedValue(null);
      await expectCode(
        service.remove(LISTING_ID, owner, M1),
        ApiErrorCode.NOT_FOUND,
      );
      expect(prisma.listingMedia.delete).not.toHaveBeenCalled();
    });

    it('rejects a stranger with 403', async () => {
      mockListing();
      await expectCode(
        service.remove(LISTING_ID, stranger, M1),
        ApiErrorCode.FORBIDDEN,
      );
    });
  });

  describe('reorder', () => {
    it('rewrites sort_order from the order array in one transaction', async () => {
      mockListing();
      prisma.listingMedia.findMany
        .mockResolvedValueOnce([{ id: M1 }, { id: M2 }]) // existing ids
        .mockResolvedValueOnce([
          { id: M2, url: 'b', thumbnailUrl: null, sortOrder: 0, type: MediaType.IMAGE },
          { id: M1, url: 'a', thumbnailUrl: null, sortOrder: 1, type: MediaType.IMAGE },
        ]);

      const result = await service.reorder(LISTING_ID, owner, [M2, M1]);

      expect(prisma.listingMedia.update).toHaveBeenCalledWith({
        where: { id: M2 },
        data: { sortOrder: 0 },
      });
      expect(prisma.listingMedia.update).toHaveBeenCalledWith({
        where: { id: M1 },
        data: { sortOrder: 1 },
      });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(result.map((m) => m.id)).toEqual([M2, M1]);
    });

    it('rejects an order that is not a full permutation (400)', async () => {
      mockListing();
      prisma.listingMedia.findMany.mockResolvedValue([{ id: M1 }, { id: M2 }]);
      await expectCode(
        service.reorder(LISTING_ID, owner, [M1]),
        ApiErrorCode.VALIDATION_ERROR,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects an order containing an unknown media id (400)', async () => {
      mockListing();
      prisma.listingMedia.findMany.mockResolvedValue([{ id: M1 }, { id: M2 }]);
      await expectCode(
        service.reorder(LISTING_ID, owner, [M1, 'cccccccc-cccc-4ccc-cccc-cccccccccccc']),
        ApiErrorCode.VALIDATION_ERROR,
      );
    });
  });

  describe('listing gate', () => {
    it('returns 404 when the listing does not exist', async () => {
      prisma.listing.findUnique.mockResolvedValue(null);
      await expectCode(
        service.uploadFile(LISTING_ID, owner, makeFile()),
        ApiErrorCode.NOT_FOUND,
      );
    });
  });
});
