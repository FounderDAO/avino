import { describe, expect, it } from 'vitest';
import { descriptionLang } from './descriptionLang';

describe('descriptionLang (SEO AUD-14)', () => {
  it('marks the author language when the page language has no real translation', () => {
    expect(descriptionLang({ originalLanguage: 'RU', translationsAvailable: ['RU'] }, 'uz')).toBe('ru');
  });

  it('no mark when the page language is translated or is the original', () => {
    expect(descriptionLang({ originalLanguage: 'RU', translationsAvailable: ['RU', 'UZ'] }, 'uz')).toBeUndefined();
    expect(descriptionLang({ originalLanguage: 'RU', translationsAvailable: ['RU'] }, 'ru')).toBeUndefined();
  });

  it('no mark with an old API that does not send the list', () => {
    expect(descriptionLang({ originalLanguage: 'RU' }, 'uz')).toBeUndefined();
    expect(descriptionLang({}, 'uz')).toBeUndefined();
  });
});
