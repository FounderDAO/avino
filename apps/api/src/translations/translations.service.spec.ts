import { ForbiddenException, HttpException, NotFoundException } from '@nestjs/common';
import { Language, ListingStatus, TranslationSource } from '@prisma/client';
import { UserRole } from '@avino/shared';
import { ApiErrorCode } from '../common/dto/error-response.dto';
import { AuthenticatedUser } from '../common/guards';
import { TranslationsService } from './translations.service';

/**
 * Юнит-тесты TranslationsService (TASK-070). Prisma мокается — проверяются:
 * построение авторской строки на original_language (source=USER), выбор языка
 * с фолбэком (?lang → Accept-Language → original_language → первая доступная) и
 * выдача всех переводов с гейтом владелец/MODERATOR/ADMIN (403 чужой / 404
 * отсутствующий|DELETED).
 */
describe('TranslationsService', () => {
  const OWNER_ID = 'u-owner';
  const LISTING_ID = '11111111-1111-1111-1111-111111111111';

  const owner: AuthenticatedUser = { id: OWNER_ID, roles: [UserRole.OWNER] };
  const moderator: AuthenticatedUser = { id: 'mod', roles: [UserRole.MODERATOR] };
  const admin: AuthenticatedUser = { id: 'adm', roles: [UserRole.ADMIN] };
  const stranger: AuthenticatedUser = { id: 'x', roles: [UserRole.USER] };

  let prisma: any;
  let service: TranslationsService;

  beforeEach(() => {
    prisma = {
      listing: { findUnique: jest.fn() },
      listingTranslation: { upsert: jest.fn() },
    };
    service = new TranslationsService(prisma);
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

  describe('buildOriginalTranslationInput', () => {
    it('builds a USER author row on the original language with null optional fields', () => {
      const input = service.buildOriginalTranslationInput(Language.RU, {
        title: '2-комн квартира',
      });

      expect(input).toEqual({
        language: Language.RU,
        source: TranslationSource.USER,
        isAutoTranslated: false,
        title: '2-комн квартира',
        description: null,
        addressNote: null,
        featuresText: null,
      });
    });

    it('maps all provided snake_case fields', () => {
      const input = service.buildOriginalTranslationInput(Language.EN, {
        title: 'Apartment',
        description: 'Bright',
        address_note: 'near metro',
        features_text: 'balcony',
      });

      expect(input).toMatchObject({
        language: Language.EN,
        title: 'Apartment',
        description: 'Bright',
        addressNote: 'near metro',
        featuresText: 'balcony',
      });
    });
  });

  describe('resolveLanguage', () => {
    const translations = [{ language: Language.RU }, { language: Language.EN }];

    it('prefers ?lang when a translation exists', () => {
      expect(
        service.resolveLanguage(translations, Language.RU, 'en'),
      ).toBe(Language.EN);
    });

    it('falls back to original_language when ?lang has no translation', () => {
      expect(
        service.resolveLanguage(translations, Language.RU, 'uz'),
      ).toBe(Language.RU);
    });

    it('uses Accept-Language when ?lang is absent (q-weights ignored)', () => {
      expect(
        service.resolveLanguage(
          translations,
          Language.RU,
          undefined,
          'en-US,en;q=0.9,ru;q=0.8',
        ),
      ).toBe(Language.EN);
    });

    it('falls back to the first available translation when original is missing', () => {
      expect(
        service.resolveLanguage([{ language: Language.EN }], Language.UZ),
      ).toBe(Language.EN);
    });

    it('ignores an unrecognized ?lang value', () => {
      expect(
        service.resolveLanguage(translations, Language.RU, 'xx'),
      ).toBe(Language.RU);
    });
  });

  describe('listByListing', () => {
    const row = {
      ownerId: OWNER_ID,
      status: ListingStatus.ACTIVE,
      originalLanguage: Language.RU,
      translations: [
        {
          language: Language.RU,
          source: TranslationSource.USER,
          isAutoTranslated: false,
          title: '2-комн квартира',
          description: 'Светлая',
          addressNote: 'рядом метро',
          featuresText: 'балкон',
        },
        {
          language: Language.EN,
          source: TranslationSource.GOOGLE,
          isAutoTranslated: true,
          title: '2-room apartment',
          description: null,
          addressNote: null,
          featuresText: null,
        },
      ],
    };

    it('returns all translations to the owner as snake_case items', async () => {
      prisma.listing.findUnique.mockResolvedValue(row);

      const result = await service.listByListing(LISTING_ID, owner);

      expect(result).toEqual({
        listing_id: LISTING_ID,
        original_language: Language.RU,
        translations: [
          {
            language: Language.RU,
            source: TranslationSource.USER,
            is_auto_translated: false,
            title: '2-комн квартира',
            description: 'Светлая',
            address_note: 'рядом метро',
            features_text: 'балкон',
          },
          {
            language: Language.EN,
            source: TranslationSource.GOOGLE,
            is_auto_translated: true,
            title: '2-room apartment',
            description: null,
            address_note: null,
            features_text: null,
          },
        ],
      });
    });

    it('allows MODERATOR and ADMIN to view another user listing', async () => {
      prisma.listing.findUnique.mockResolvedValue(row);

      await expect(
        service.listByListing(LISTING_ID, moderator),
      ).resolves.toMatchObject({ listing_id: LISTING_ID });
      await expect(
        service.listByListing(LISTING_ID, admin),
      ).resolves.toMatchObject({ listing_id: LISTING_ID });
    });

    it('throws 403 FORBIDDEN for an authenticated stranger', async () => {
      prisma.listing.findUnique.mockResolvedValue(row);

      const promise = service.listByListing(LISTING_ID, stranger);
      await expect(promise).rejects.toBeInstanceOf(ForbiddenException);
      await expectCode(
        service.listByListing(LISTING_ID, stranger),
        ApiErrorCode.FORBIDDEN,
      );
    });

    it('throws 404 NOT_FOUND when the listing is missing', async () => {
      prisma.listing.findUnique.mockResolvedValue(null);

      const promise = service.listByListing(LISTING_ID, owner);
      await expect(promise).rejects.toBeInstanceOf(NotFoundException);
      await expectCode(
        service.listByListing(LISTING_ID, owner),
        ApiErrorCode.NOT_FOUND,
      );
    });

    it('hides a DELETED listing even from the owner (404)', async () => {
      prisma.listing.findUnique.mockResolvedValue({
        ...row,
        status: ListingStatus.DELETED,
      });

      await expectCode(
        service.listByListing(LISTING_ID, owner),
        ApiErrorCode.NOT_FOUND,
      );
    });
  });

  describe('updateModeratorTranslation', () => {
    it('upserts a non-original language with is_auto_translated=false', async () => {
      prisma.listing.findUnique.mockResolvedValue({ originalLanguage: Language.RU, status: ListingStatus.NEW });
      await service.updateModeratorTranslation(LISTING_ID, Language.EN, { title: 'Fixed EN' });
      const arg = prisma.listingTranslation.upsert.mock.calls[0][0];
      expect(arg.where.listingId_language).toEqual({ listingId: LISTING_ID, language: Language.EN });
      expect(arg.update).toMatchObject({ isAutoTranslated: false, title: 'Fixed EN' });
      expect(arg.create).toMatchObject({ isAutoTranslated: false, source: TranslationSource.USER, title: 'Fixed EN' });
    });

    it('rejects editing the original language (422)', async () => {
      prisma.listing.findUnique.mockResolvedValue({ originalLanguage: Language.RU, status: ListingStatus.NEW });
      await expect(
        service.updateModeratorTranslation(LISTING_ID, Language.RU, { title: 'x' }),
      ).rejects.toMatchObject({ status: 422 });
    });

    it('404 when listing missing or DELETED', async () => {
      prisma.listing.findUnique.mockResolvedValue(null);
      await expect(
        service.updateModeratorTranslation(LISTING_ID, Language.EN, { title: 'x' }),
      ).rejects.toMatchObject({ status: 404 });
    });
  });
});
