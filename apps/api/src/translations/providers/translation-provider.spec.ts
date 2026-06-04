import { ConfigService } from '@nestjs/config';
import { Language } from '@prisma/client';
import { GoogleTranslationProvider } from './google.provider';
import { YandexTranslationProvider } from './yandex.provider';

/**
 * Юнит-тесты провайдеров перевода (TASK-071). Проверяют:
 * - мягкую деградацию без API-ключа (возврат исходного текста, без HTTP);
 * - реальный путь (мок `fetch`): корректный разбор ответа и проброс ошибки
 *   провайдера наверх (для ретрая воркером);
 * - пустой текст не уходит в провайдер.
 */
describe('Translation providers', () => {
  const config = (overrides: Record<string, unknown>): ConfigService =>
    ({ get: (key: string) => overrides[key] }) as unknown as ConfigService;

  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  describe('graceful degradation (no API key)', () => {
    it('returns the source text unchanged without calling fetch (Yandex)', async () => {
      const fetchSpy = jest.fn();
      global.fetch = fetchSpy as unknown as typeof fetch;
      const provider = new YandexTranslationProvider(config({}));

      const result = await provider.translate('Tихи', Language.RU, Language.EN);

      expect(result).toBe('Tихи');
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('returns the source text unchanged without calling fetch (Google)', async () => {
      const fetchSpy = jest.fn();
      global.fetch = fetchSpy as unknown as typeof fetch;
      const provider = new GoogleTranslationProvider(config({}));

      const result = await provider.translate(
        'hello',
        Language.EN,
        Language.RU,
      );

      expect(result).toBe('hello');
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  it('returns empty string for blank text without configuration', async () => {
    const provider = new YandexTranslationProvider(
      config({ 'translate.apiKey': 'k' }),
    );
    expect(await provider.translate('   ', Language.RU, Language.EN)).toBe('');
  });

  describe('Yandex HTTP path', () => {
    it('parses the translation from the API response', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ translations: [{ text: 'Apartment' }] }),
      }) as unknown as typeof fetch;
      const provider = new YandexTranslationProvider(
        config({ 'translate.apiKey': 'secret', 'translate.folderId': 'f1' }),
      );

      const result = await provider.translate(
        'Kvartira',
        Language.UZ,
        Language.EN,
      );

      expect(result).toBe('Apartment');
    });

    it('throws on a non-OK response so the job can retry', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 503,
      }) as unknown as typeof fetch;
      const provider = new YandexTranslationProvider(
        config({ 'translate.apiKey': 'secret' }),
      );

      await expect(
        provider.translate('Kvartira', Language.UZ, Language.EN),
      ).rejects.toThrow('Yandex Translate failed: 503');
    });
  });

  describe('Google HTTP path', () => {
    it('parses the translation from the API response', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: { translations: [{ translatedText: 'Kvartira' }] },
        }),
      }) as unknown as typeof fetch;
      const provider = new GoogleTranslationProvider(
        config({ 'translate.apiKey': 'secret' }),
      );

      const result = await provider.translate(
        'Apartment',
        Language.EN,
        Language.UZ,
      );

      expect(result).toBe('Kvartira');
    });
  });
});
