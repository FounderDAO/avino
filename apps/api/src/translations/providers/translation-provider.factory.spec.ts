import { TranslationSource } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { createTranslationProvider } from './translation-provider.factory';
import { GoogleTranslationProvider } from './google.provider';
import { YandexTranslationProvider } from './yandex.provider';

/**
 * Юнит-тесты фабрики провайдера перевода (TASK-071). Проверяют, что провайдер
 * выбирается по `translate.provider` из конфигурации (yandex|google), с фолбэком
 * на Yandex (MVP-провайдер по умолчанию, configuration.ts) при неизвестном/пустом
 * значении.
 */
describe('createTranslationProvider', () => {
  const configWith = (provider?: string): ConfigService =>
    ({
      get: (key: string) =>
        key === 'translate.provider' ? provider : undefined,
    }) as unknown as ConfigService;

  it('selects the Yandex provider when configured', () => {
    const provider = createTranslationProvider(configWith('yandex'));
    expect(provider).toBeInstanceOf(YandexTranslationProvider);
    expect(provider.source).toBe(TranslationSource.YANDEX);
  });

  it('selects the Google provider when configured', () => {
    const provider = createTranslationProvider(configWith('google'));
    expect(provider).toBeInstanceOf(GoogleTranslationProvider);
    expect(provider.source).toBe(TranslationSource.GOOGLE);
  });

  it('falls back to Yandex when the provider is unset or unknown', () => {
    expect(createTranslationProvider(configWith(undefined))).toBeInstanceOf(
      YandexTranslationProvider,
    );
    expect(createTranslationProvider(configWith('deepl'))).toBeInstanceOf(
      YandexTranslationProvider,
    );
  });
});
