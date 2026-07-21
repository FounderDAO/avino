import { Language, ListingStatus, TranslationSource } from '@prisma/client';
import { ListingAutoTranslator } from './listing-auto-translator.service';
import { TranslationProvider } from './providers/translation-provider.interface';

/**
 * Юнит-тесты сервиса авто-перевода (TASK-071, ADR-0091). Prisma и провайдер
 * мокаются. Проверяют: перевод авторской строки на остальные языки с upsert
 * (source=провайдер, is_auto_translated=true), пропуск исходного языка,
 * сохранение null-полей без вызова провайдера, охранные пропуски (нет листинга /
 * DELETED / нет авторской строки) и защиту ручных правок (is_auto_translated=false).
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
        isAutoTranslated: false,
      },
    ],
    ...overrides,
  });

  it('translates the author row into the other two languages and upserts them', async () => {
    prisma.listing.findUnique.mockResolvedValue(activeListing());

    await service.generateTranslations(LISTING_ID);

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

    await service.generateTranslations(LISTING_ID);

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
    const result = await service.generateTranslations(LISTING_ID);
    expect(prisma.listingTranslation.upsert).not.toHaveBeenCalled();
    expect(result).toEqual({ regenerated: [], skipped: [] });
  });

  it('generates translations for a NEW listing (no ACTIVE requirement)', async () => {
    prisma.listing.findUnique.mockResolvedValue(
      activeListing({ status: ListingStatus.NEW }),
    );
    await service.generateTranslations(LISTING_ID);
    expect(prisma.listingTranslation.upsert).toHaveBeenCalledTimes(2); // UZ + EN
  });

  it('skips DELETED listings', async () => {
    prisma.listing.findUnique.mockResolvedValue(
      activeListing({ status: ListingStatus.DELETED }),
    );
    await service.generateTranslations(LISTING_ID);
    expect(prisma.listingTranslation.upsert).not.toHaveBeenCalled();
  });

  it('skips when the author translation row is missing', async () => {
    prisma.listing.findUnique.mockResolvedValue(
      activeListing({ translations: [] }),
    );
    await service.generateTranslations(LISTING_ID);
    expect(prisma.listingTranslation.upsert).not.toHaveBeenCalled();
  });

  it('preserves a manually-edited target language (is_auto_translated=false)', async () => {
    prisma.listing.findUnique.mockResolvedValue(
      activeListing({
        translations: [
          { language: Language.RU, title: 'Квартира', description: 'Описание', addressNote: null, featuresText: 'Лифт', isAutoTranslated: false },
          { language: Language.EN, title: 'HAND-EDITED', description: null, addressNote: null, featuresText: null, isAutoTranslated: false },
        ],
      }),
    );
    const result = await service.generateTranslations(LISTING_ID);
    // EN is hand-edited → skipped; only UZ is (re)generated.
    expect(prisma.listingTranslation.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.listingTranslation.upsert.mock.calls[0][0].where.listingId_language.language).toBe(Language.UZ);
    // Result reports the honest split so the UI toast can be truthful.
    expect(result).toEqual({ regenerated: [Language.UZ], skipped: [Language.EN] });
  });

  it('force overwrites manually-edited target languages but never the original', async () => {
    // Reproduces the seed-junk bug: all three languages are source=USER,
    // is_auto_translated=false with unrelated text; without force the moderator
    // is stuck (nothing regenerates). force must rewrite every TARGET from the
    // author row while leaving the original-language (RU) row untouched.
    prisma.listing.findUnique.mockResolvedValue(
      activeListing({
        translations: [
          { language: Language.RU, title: 'Квартира', description: 'Test post', addressNote: null, featuresText: null, isAutoTranslated: false },
          { language: Language.UZ, title: 'JUNK-UZ', description: 'aloqasiz matn', addressNote: null, featuresText: null, isAutoTranslated: false },
          { language: Language.EN, title: 'JUNK-EN', description: '39 Superior Street offers…', addressNote: null, featuresText: null, isAutoTranslated: false },
        ],
      }),
    );

    const result = await service.generateTranslations(LISTING_ID, { force: true });

    // Only the two TARGET languages are upserted; RU (original) is never written.
    expect(prisma.listingTranslation.upsert).toHaveBeenCalledTimes(2);
    const langs = prisma.listingTranslation.upsert.mock.calls.map(
      (c: any[]) => c[0].where.listingId_language.language,
    );
    expect(langs.sort()).toEqual([Language.EN, Language.UZ]);
    expect(langs).not.toContain(Language.RU);

    // EN is produced from the RU author title, never from the junk EN row.
    expect(provider.translate).toHaveBeenCalledWith('Квартира', Language.RU, Language.EN);
    expect(provider.translate).not.toHaveBeenCalledWith(
      'JUNK-EN',
      expect.anything(),
      expect.anything(),
    );
    // Rewritten rows are marked machine-translated again.
    const enCall = prisma.listingTranslation.upsert.mock.calls.find(
      (c: any[]) => c[0].where.listingId_language.language === Language.EN,
    )[0];
    expect(enCall.update).toMatchObject({
      source: TranslationSource.YANDEX,
      isAutoTranslated: true,
      title: 'Квартира#EN',
    });
    expect(result).toEqual({ regenerated: [Language.UZ, Language.EN], skipped: [] });
  });

  it('without force reports every manual target as skipped (nothing regenerated)', async () => {
    // The stuck state: both targets are manual → button must honestly report it.
    prisma.listing.findUnique.mockResolvedValue(
      activeListing({
        translations: [
          { language: Language.RU, title: 'Квартира', description: 'Test post', addressNote: null, featuresText: null, isAutoTranslated: false },
          { language: Language.UZ, title: 'JUNK-UZ', description: null, addressNote: null, featuresText: null, isAutoTranslated: false },
          { language: Language.EN, title: 'JUNK-EN', description: null, addressNote: null, featuresText: null, isAutoTranslated: false },
        ],
      }),
    );

    const result = await service.generateTranslations(LISTING_ID);

    expect(prisma.listingTranslation.upsert).not.toHaveBeenCalled();
    expect(result).toEqual({ regenerated: [], skipped: [Language.UZ, Language.EN] });
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
            isAutoTranslated: true,
          },
          {
            language: Language.RU,
            title: 'Квартира',
            description: 'Описание',
            addressNote: null,
            featuresText: 'Лифт',
            isAutoTranslated: false,
          },
        ],
      }),
    );

    await service.generateTranslations(LISTING_ID);

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
