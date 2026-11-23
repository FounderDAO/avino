import { Language } from '@prisma/client';
import { availableTranslationLanguages } from './translation-availability';

const author = { language: Language.RU, title: 'Продаётся квартира', description: 'Светлая', isAutoTranslated: false };

describe('availableTranslationLanguages (SEO AUD-14)', () => {
  it('counts the original, manual rows and real machine translations', () => {
    expect(
      availableTranslationLanguages(
        [
          author,
          { language: Language.UZ, title: 'Kvartira sotiladi', description: 'Yorug‘', isAutoTranslated: true },
          { language: Language.EN, title: 'Flat for sale', description: null, isAutoTranslated: false },
        ],
        Language.RU,
      ),
    ).toEqual([Language.UZ, Language.RU, Language.EN]);
  });

  it('drops machine rows that are copies of the original', () => {
    expect(
      availableTranslationLanguages(
        [author, { ...author, language: Language.UZ, isAutoTranslated: true }, { ...author, language: Language.EN, isAutoTranslated: true }],
        Language.RU,
      ),
    ).toEqual([Language.RU]);
  });

  it('keeps a machine row whose title is the same but the description differs (addresses are not translated)', () => {
    expect(
      availableTranslationLanguages(
        [author, { ...author, language: Language.EN, description: 'Bright', isAutoTranslated: true }],
        Language.RU,
      ),
    ).toEqual([Language.RU, Language.EN]);
  });

  it('always includes the original language, even without its row', () => {
    expect(availableTranslationLanguages([], Language.UZ)).toEqual([Language.UZ]);
  });
});
