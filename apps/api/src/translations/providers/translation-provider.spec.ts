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

    it('includes the provider error body in the thrown error (expired key)', async () => {
      const body = JSON.stringify({
        code: 16,
        message: 'The apikey has expired 2026-07-31T19:00:00Z.',
      });
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => body,
      }) as unknown as typeof fetch;
      const provider = new YandexTranslationProvider(
        config({ 'translate.apiKey': 'secret' }),
      );

      await expect(
        provider.translate('Kvartira', Language.UZ, Language.EN),
      ).rejects.toThrow(
        'Yandex Translate failed: 401 The apikey has expired 2026-07-31T19:00:00Z.',
      );
    });
  });

  describe('Yandex long text (10 000-char request limit)', () => {
    it('splits the text into several requests and joins the result', async () => {
      const paragraph = `${'а'.repeat(5999)}.`;
      const text = [paragraph, paragraph, paragraph].join('\n\n');
      const fetchMock = jest.fn(
        async (_url: string, init: { body: string }) => {
          const sent = (JSON.parse(init.body) as { texts: string[] }).texts[0];
          return {
            ok: true,
            json: async () => ({
              translations: [{ text: sent.toUpperCase() }],
            }),
          };
        },
      );
      global.fetch = fetchMock as unknown as typeof fetch;
      const provider = new YandexTranslationProvider(
        config({ 'translate.apiKey': 'secret' }),
      );

      const result = await provider.translate(text, Language.RU, Language.EN);

      expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
      for (const [, init] of fetchMock.mock.calls) {
        const sent = (JSON.parse(init.body) as { texts: string[] }).texts[0];
        expect(sent.length).toBeLessThanOrEqual(10000);
      }
      // Разделители абзацев сохранены, ничего не потеряно.
      expect(result).toBe(text.toUpperCase());
    });
  });

  describe('Yandex detectLanguage', () => {
    const detect = (response: unknown) => {
      global.fetch = jest
        .fn()
        .mockResolvedValue(response) as unknown as typeof fetch;
      return new YandexTranslationProvider(
        config({ 'translate.apiKey': 'secret', 'translate.folderId': 'f1' }),
      ).detectLanguage('Yunusobod tumanida kvartira sotiladi');
    };

    it('maps the detected code to Language', async () => {
      await expect(
        detect({ ok: true, json: async () => ({ languageCode: 'uz' }) }),
      ).resolves.toBe(Language.UZ);
      const body = JSON.parse(
        (global.fetch as jest.Mock).mock.calls[0][1].body as string,
      );
      expect(body).toMatchObject({
        text: 'Yunusobod tumanida kvartira sotiladi',
        languageCodeHints: ['uz', 'ru', 'en'],
        folderId: 'f1',
      });
    });

    it('treats Uzbek Cyrillic (uzbcyr) as UZ', async () => {
      await expect(
        detect({ ok: true, json: async () => ({ languageCode: 'uzbcyr' }) }),
      ).resolves.toBe(Language.UZ);
    });

    it('returns null for an unsupported language or a failed call', async () => {
      await expect(
        detect({ ok: true, json: async () => ({ languageCode: 'kk' }) }),
      ).resolves.toBeNull();
      await expect(detect({ ok: false, status: 500 })).resolves.toBeNull();
    });

    it('returns null without an API key and does not call fetch', async () => {
      const fetchSpy = jest.fn();
      global.fetch = fetchSpy as unknown as typeof fetch;
      await expect(
        new YandexTranslationProvider(config({})).detectLanguage('текст'),
      ).resolves.toBeNull();
      expect(fetchSpy).not.toHaveBeenCalled();
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

    it('includes the provider error body in the thrown error', async () => {
      const body = JSON.stringify({
        error: { code: 400, message: 'API key not valid.' },
      });
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => body,
      }) as unknown as typeof fetch;
      const provider = new GoogleTranslationProvider(
        config({ 'translate.apiKey': 'secret' }),
      );

      await expect(
        provider.translate('Apartment', Language.EN, Language.UZ),
      ).rejects.toThrow('Google Translate failed: 400 API key not valid.');
    });
  });
});
