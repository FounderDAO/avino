import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Language, TranslationSource } from '@prisma/client';
import { readProviderErrorReason } from './provider-error';
import { splitTextForTranslation } from './split-text';
import { TranslationProvider } from './translation-provider.interface';

const API_BASE_URL = 'https://translate.api.cloud.yandex.net/translate/v2';

/** Лимит Yandex Translate на суммарную длину текстов одного запроса. */
const MAX_REQUEST_TEXT_LENGTH = 10000;

/** Лимит Yandex на длину текста в `detect`. */
const MAX_DETECT_TEXT_LENGTH = 1000;

/** Подсказка `detect`: выбираем только среди поддерживаемых языков. */
const SUPPORTED_LANG_CODES = ['uz', 'ru', 'en'];

const UZBEK_CYRILLIC_CODE = 'uzbcyr';

/** `Language` (enum) → ISO-код языка, понятный Yandex/Google (`UZ` → `uz`). */
function toLangCode(language: Language): string {
  return language.toLowerCase();
}

/**
 * YandexTranslationProvider — перевод через Yandex Cloud Translate API v2
 * (TASK-071, CLAUDE.md §13 — провайдер для MVP). HTTP — через глобальный `fetch`
 * (Node ≥ 20), доп. зависимость не нужна (как в {@link SmsService}).
 *
 * Поведение по конфигурации:
 * - `TRANSLATE_API_KEY` задан → реальный вызов API (Api-Key авторизация,
 *   `TRANSLATE_FOLDER_ID` подставляется в тело, если задан);
 * - ключ не задан (dev) → мягкая деградация: возвращаем исходный текст без
 *   изменений и логируем предупреждение, чтобы flow проходил без внешней
 *   зависимости и пустой ключ не плодил ретраи.
 */
@Injectable()
export class YandexTranslationProvider implements TranslationProvider {
  readonly source = TranslationSource.YANDEX;
  private readonly logger = new Logger(YandexTranslationProvider.name);

  constructor(private readonly configService: ConfigService) {}

  async translate(text: string, from: Language, to: Language): Promise<string> {
    if (!text.trim()) {
      return '';
    }

    const apiKey = this.configService.get<string>('translate.apiKey');
    if (!apiKey) {
      this.logger.warn(
        `Yandex Translate is not configured; returning source text as-is (${from}→${to})`,
      );
      return text;
    }

    // Лимит Yandex — 10 000 символов на запрос: длинный текст переводим частями.
    // Пробельные края части (переводы строк между абзацами) в провайдер не
    // отправляем и возвращаем как были — так разбивка на абзацы не теряется.
    const parts: string[] = [];
    for (const chunk of splitTextForTranslation(
      text,
      MAX_REQUEST_TEXT_LENGTH,
    )) {
      const core = chunk.trim();
      if (!core) {
        parts.push(chunk);
        continue;
      }
      const start = chunk.indexOf(core);
      parts.push(
        chunk.slice(0, start) +
          (await this.translateChunk(core, from, to, apiKey)) +
          chunk.slice(start + core.length),
      );
    }
    return parts.join('');
  }

  async detectLanguage(text: string): Promise<Language | null> {
    const apiKey = this.configService.get<string>('translate.apiKey');
    if (!apiKey || !text.trim()) {
      return null;
    }

    const folderId = this.configService.get<string>('translate.folderId');
    try {
      const res = await fetch(`${API_BASE_URL}/detect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Api-Key ${apiKey}`,
        },
        body: JSON.stringify({
          text: text.slice(0, MAX_DETECT_TEXT_LENGTH),
          languageCodeHints: SUPPORTED_LANG_CODES,
          ...(folderId ? { folderId } : {}),
        }),
      });
      if (!res.ok) {
        this.logger.warn(`Yandex language detection failed: ${res.status}`);
        return null;
      }
      const json = (await res.json()) as { languageCode?: string };
      // Узбекскую кириллицу Yandex отдаёт отдельным кодом `uzbcyr`.
      const code =
        json.languageCode === UZBEK_CYRILLIC_CODE
          ? Language.UZ
          : json.languageCode?.toUpperCase();
      return (Object.values(Language) as string[]).includes(code ?? '')
        ? (code as Language)
        : null;
    } catch (error) {
      this.logger.warn(
        `Yandex language detection failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  private async translateChunk(
    text: string,
    from: Language,
    to: Language,
    apiKey: string,
  ): Promise<string> {
    const folderId = this.configService.get<string>('translate.folderId');
    const res = await fetch(`${API_BASE_URL}/translate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Api-Key ${apiKey}`,
      },
      body: JSON.stringify({
        sourceLanguageCode: toLangCode(from),
        targetLanguageCode: toLangCode(to),
        texts: [text],
        ...(folderId ? { folderId } : {}),
      }),
    });

    if (!res.ok) {
      const reason = await readProviderErrorReason(res);
      throw new Error(
        `Yandex Translate failed: ${res.status} ${reason}`.trim(),
      );
    }

    const json = (await res.json()) as {
      translations?: { text?: string }[];
    };
    const translated = json.translations?.[0]?.text;
    if (!translated) {
      throw new Error('Yandex Translate returned no translation');
    }
    return translated;
  }
}
