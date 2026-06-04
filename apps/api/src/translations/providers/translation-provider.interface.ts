import { Language, TranslationSource } from '@prisma/client';

/**
 * Инъекционный токен выбранного провайдера перевода (TASK-071).
 *
 * Конкретная реализация (Yandex/Google) выбирается фабрикой по `TRANSLATE_PROVIDER`
 * (см. {@link translationProviderFactory}). Воркер ({@link ListingAutoTranslator})
 * зависит только от интерфейса {@link TranslationProvider}, а не от транспорта.
 */
export const TRANSLATION_PROVIDER = Symbol('TRANSLATION_PROVIDER');

/**
 * Провайдер машинного перевода — абстракция над Google/Yandex (CLAUDE.md §13,
 * ADR-005). Контракт узкий: перевести строку из одного языка в другой.
 *
 * Если провайдер не сконфигурирован (нет API-ключа), реализация деградирует мягко
 * и возвращает исходный текст без изменений — по аналогии с {@link SmsService} /
 * {@link EmailService} в dev. Это позволяет пройти flow без внешней зависимости и
 * не плодит бесконечные ретраи на пустом ключе.
 */
export interface TranslationProvider {
  /** Источник перевода для записи в `listing_translations.source`. */
  readonly source: TranslationSource;

  /** Перевести `text` с языка `from` на язык `to`. Пустой текст → пустая строка. */
  translate(text: string, from: Language, to: Language): Promise<string>;
}
