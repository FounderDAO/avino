import { ConfigService } from '@nestjs/config';
import { TranslateProvider } from '../../config/env.validation';
import { GoogleTranslationProvider } from './google.provider';
import { TranslationProvider } from './translation-provider.interface';
import { YandexTranslationProvider } from './yandex.provider';

/**
 * Выбрать реализацию провайдера перевода по `translate.provider` (TASK-071).
 *
 * `TRANSLATE_PROVIDER=google` → Google, иначе (включая неизвестное/пустое
 * значение) — Yandex как провайдер по умолчанию для MVP (configuration.ts,
 * CLAUDE.md §13). Значение уже провалидировано env.validation как enum, фолбэк —
 * подстраховка на уровне типа.
 */
export function createTranslationProvider(
  configService: ConfigService,
): TranslationProvider {
  const provider = configService.get<string>('translate.provider');
  if (provider === TranslateProvider.Google) {
    return new GoogleTranslationProvider(configService);
  }
  return new YandexTranslationProvider(configService);
}
