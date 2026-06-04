import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Language, TranslationSource } from '@prisma/client';
import { TranslationProvider } from './translation-provider.interface';

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

    const folderId = this.configService.get<string>('translate.folderId');
    const res = await fetch(
      'https://translate.api.cloud.yandex.net/translate/v2/translate',
      {
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
      },
    );

    if (!res.ok) {
      throw new Error(`Yandex Translate failed: ${res.status}`);
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
