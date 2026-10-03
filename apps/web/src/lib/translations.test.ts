import { describe, expect, it } from 'vitest';
import type { TranslationItem } from '@/store/api/adminTypes';
import {
  originalLanguageMismatchWarning,
  translationErrorToast,
  translationRowKey,
} from './translations';

const item = (over: Partial<TranslationItem> = {}): TranslationItem => ({
  language: 'EN',
  source: 'YANDEX',
  is_auto_translated: true,
  title: 'Apartment',
  description: 'Bright apartment',
  address_note: null,
  features_text: null,
  ...over,
});

describe('translationRowKey', () => {
  it('differs between listings, so a row never keeps the previous listing text', () => {
    expect(translationRowKey('listing-a', item())).not.toBe(
      translationRowKey('listing-b', item()),
    );
  });

  it('changes when the server text changes (regenerated translation)', () => {
    expect(translationRowKey('a', item({ description: 'Old text' }))).not.toBe(
      translationRowKey('a', item({ description: 'New text' })),
    );
  });

  it('is stable while the server row is unchanged', () => {
    expect(translationRowKey('a', item())).toBe(translationRowKey('a', item()));
  });
});

describe('translationErrorToast', () => {
  it('shows the provider reason from a 502', () => {
    const error = {
      status: 502,
      data: {
        error: {
          code: 'INTERNAL_ERROR',
          message:
            'Translation provider failed: Yandex Translate failed: 401 The apikey has expired',
        },
      },
    };
    expect(translationErrorToast(error)).toBe(
      'Сервис перевода недоступен: Yandex Translate failed: 401 The apikey has expired',
    );
  });

  it('falls back to the generic text for other failures', () => {
    expect(translationErrorToast({ status: 500, data: {} })).toBe(
      'Не удалось сгенерировать переводы',
    );
    expect(translationErrorToast(undefined)).toBe(
      'Не удалось сгенерировать переводы',
    );
  });
});

describe('originalLanguageMismatchWarning', () => {
  const result = (detected: 'UZ' | 'RU' | 'EN' | null | undefined) => ({
    listing_id: 'a',
    original_language: 'RU' as const,
    translations: [],
    regenerated: [],
    skipped: [],
    detected_language: detected,
  });

  it('warns when the detected language differs from the original', () => {
    expect(originalLanguageMismatchWarning(result('UZ'), 'a', 'RU')).toBe(
      'Текст оригинала похож на «Ўзбекча», а язык оригинала указан «Русский». Исправьте язык оригинала и переведите заново — иначе перевод будет некорректным.',
    );
  });

  it('is silent when languages match or nothing was detected', () => {
    expect(originalLanguageMismatchWarning(result('RU'), 'a', 'RU')).toBeNull();
    expect(originalLanguageMismatchWarning(result(null), 'a', 'RU')).toBeNull();
    expect(originalLanguageMismatchWarning(result(undefined), 'a', 'RU')).toBeNull();
    expect(originalLanguageMismatchWarning(undefined, 'a', 'RU')).toBeNull();
  });

  it('ignores a result that belongs to another listing', () => {
    expect(originalLanguageMismatchWarning(result('UZ'), 'b', 'RU')).toBeNull();
  });

  it('disappears once the moderator fixed the original language', () => {
    expect(originalLanguageMismatchWarning(result('UZ'), 'a', 'UZ')).toBeNull();
  });
});
