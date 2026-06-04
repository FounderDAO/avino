import { Language, ListingStatus, TranslationSource } from '@prisma/client';
import { ListingAutoTranslator } from './listing-auto-translator.service';
import { TranslationProvider } from './providers/translation-provider.interface';

/**
 * Юнит-тесты воркера авто-перевода (TASK-071). Prisma и провайдер мокаются.
 * Проверяют: перевод авторской строки на остальные языки с upsert
 * (source=провайдер, is_auto_translated=true), пропуск исходного языка,
 * сохранение null-полей без вызова провайдера и охранные пропуски (нет листинга /
 * не ACTIVE / нет авторской строки).
 */
describe('ListingAutoTranslator', () => {
  const LISTING_ID = '11111111-1111-1111-1111-111111111111';

  let prisma: any;
  let provider: jest.Mocked<TranslationProvider>;
  let service: ListingAutoTranslator;

  beforeEach(() => {
    prisma = {
      listing: { findUnique: jest.fn() },
      listingTranslation: { upsert: jest.fn().mockResolvedValue({}) },
    };
    provider = {
      source: TranslationSource.YANDEX,
      translate: jest.fn(async (text: string, _f: Language, to: Language) =>
        text ? `${text}#${to}` : '',
      ),
    };
    service = new ListingAutoTranslator(prisma, provider);
  });

  const activeListing = (overrides: Record<string, unknown> = {}) => ({
    status: ListingStatus.ACTIVE,
    originalLanguage: Language.RU,
    translations: [
      {
        language: Language.RU,
        title: 'Квартира',
        description: 'Описание',
        addressNote: null,
        featuresText: 'Лифт',
      },
    ],
    ...overrides,
  });

  it('translates the author row into the other two languages and upserts them', async () => {
    prisma.listing.findUnique.mockResolvedValue(activeListing());

    await service.run(LISTING_ID);

    // RU is original → only UZ and EN are produced.
    expect(prisma.listingTranslation.upsert).toHaveBeenCalledTimes(2);
    const languages = prisma.listingTranslation.upsert.mock.calls.map(
      (c: any[]) => c[0].where.listingId_language.language,
    );
    expect(languages.sort()).toEqual([Language.EN, Language.UZ]);

    const enCall = prisma.listingTranslation.upsert.mock.calls.find(
      (c: any[]) => c[0].where.listingId_language.language === Language.EN,
    )[0];
    expect(enCall.create).toMatchObject({
      listingId: LISTING_ID,
      language: Language.EN,
      source: TranslationSource.YANDEX,
      isAutoTranslated: true,
      title: 'Квартира#EN',
      description: 'Описание#EN',
      addressNote: null,
      featuresText: 'Лифт#EN',
    });
    expect(enCall.update).toMatchObject({
      source: TranslationSource.YANDEX,
      isAutoTranslated: true,
      title: 'Квартира#EN',
    });
  });

  it('does not call the provider for null optional fields', async () => {
    prisma.listing.findUnique.mockResolvedValue(activeListing());

    await service.run(LISTING_ID);

    // addressNote is null for every target → provider never sees it.
    expect(provider.translate).not.toHaveBeenCalledWith(
      null,
      expect.anything(),
      expect.anything(),
    );
    // title + description + featuresText, for 2 languages = 6 calls.
    expect(provider.translate).toHaveBeenCalledTimes(6);
  });

  it('skips when the listing does not exist', async () => {
    prisma.listing.findUnique.mockResolvedValue(null);
    await service.run(LISTING_ID);
    expect(prisma.listingTranslation.upsert).not.toHaveBeenCalled();
  });

  it('skips when the listing is not ACTIVE', async () => {
    prisma.listing.findUnique.mockResolvedValue(
      activeListing({ status: ListingStatus.NEW }),
    );
    await service.run(LISTING_ID);
    expect(prisma.listingTranslation.upsert).not.toHaveBeenCalled();
  });

  it('skips when the author translation row is missing', async () => {
    prisma.listing.findUnique.mockResolvedValue(
      activeListing({ translations: [] }),
    );
    await service.run(LISTING_ID);
    expect(prisma.listingTranslation.upsert).not.toHaveBeenCalled();
  });

  it('translates from the author row even when auto rows already exist (re-run)', async () => {
    // A retry / re-publish: UZ + EN auto rows are already present.
    prisma.listing.findUnique.mockResolvedValue(
      activeListing({
        translations: [
          {
            language: Language.UZ,
            title: 'STALE-UZ',
            description: null,
            addressNote: null,
            featuresText: null,
          },
          {
            language: Language.RU,
            title: 'Квартира',
            description: 'Описание',
            addressNote: null,
            featuresText: 'Лифт',
          },
        ],
      }),
    );

    await service.run(LISTING_ID);

    // Source must be the RU author title, never the stale UZ row.
    expect(provider.translate).toHaveBeenCalledWith(
      'Квартира',
      Language.RU,
      Language.UZ,
    );
    expect(provider.translate).not.toHaveBeenCalledWith(
      'STALE-UZ',
      expect.anything(),
      expect.anything(),
    );
  });
});
