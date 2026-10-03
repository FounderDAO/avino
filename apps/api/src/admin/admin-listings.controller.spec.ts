import { BadGatewayException, Logger } from '@nestjs/common';
import { UserRole } from '@avino/shared';
import type { AuthenticatedUser } from '../common/guards';
import type { ModerationService } from '../moderation';
import type {
  ListingAutoTranslator,
  TranslationsService,
} from '../translations';
import { AdminListingsController } from './admin-listings.controller';

/**
 * Юнит-тесты `POST /admin/listings/:id/translations/generate` (ADR-0091):
 * сбой провайдера перевода не должен теряться — причина уходит в лог и в
 * сообщение 502, иначе истёкший ключ неотличим от любого другого сбоя.
 */
describe('AdminListingsController.generateTranslations', () => {
  const listingId = '11111111-1111-4111-8111-111111111111';
  const viewer = { id: 'u1', roles: [UserRole.ADMIN] } as AuthenticatedUser;

  const build = (translator: Partial<ListingAutoTranslator>) => {
    const translations = {
      listByListing: jest.fn().mockResolvedValue({
        listing_id: listingId,
        original_language: 'RU',
        translations: [],
      }),
    };
    const controller = new AdminListingsController(
      {} as ModerationService,
      translator as ListingAutoTranslator,
      translations as unknown as TranslationsService,
    );
    return { controller, translations };
  };

  afterEach(() => jest.restoreAllMocks());

  it('logs the provider failure and exposes the reason in the 502', async () => {
    const errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const { controller } = build({
      generateTranslations: jest
        .fn()
        .mockRejectedValue(
          new Error('Yandex Translate failed: 401 The apikey has expired'),
        ),
    });

    const call = controller.generateTranslations(listingId, {}, viewer);

    await expect(call).rejects.toBeInstanceOf(BadGatewayException);
    await expect(call).rejects.toMatchObject({
      response: {
        message:
          'Translation provider failed: Yandex Translate failed: 401 The apikey has expired',
      },
    });
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('The apikey has expired'),
    );
  });

  it('returns translations merged with the generation result', async () => {
    const { controller } = build({
      generateTranslations: jest
        .fn()
        .mockResolvedValue({ regenerated: ['EN', 'UZ'], skipped: [] }),
    });

    await expect(
      controller.generateTranslations(listingId, { force: true }, viewer),
    ).resolves.toMatchObject({
      listing_id: listingId,
      regenerated: ['EN', 'UZ'],
      skipped: [],
    });
  });
});
