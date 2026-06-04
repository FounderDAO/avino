import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Language, TranslationSource } from '@prisma/client';
import { TranslationProvider } from './translation-provider.interface';

/** `Language` (enum) → ISO-код языка, понятный Google (`UZ` → `uz`). */
function toLangCode(language: Language): string {
  return language.toLowerCase();
}

/**
 * GoogleTranslationProvider — перевод через Google Cloud Translation API v2
 * (TASK-071). Альтернатива Yandex, выбирается `TRANSLATE_PROVIDER=google`. HTTP —
 * через глобальный `fetch` (Node ≥ 20).
 *
 * Поведение по конфигурации идентично {@link YandexTranslationProvider}: без
 * `TRANSLATE_API_KEY` мягко деградирует и возвращает исходный текст.
 */
@Injectable()
export class GoogleTranslationProvider implements TranslationProvider {
  readonly source = TranslationSource.GOOGLE;
  private readonly logger = new Logger(GoogleTranslationProvider.name);

  constructor(private readonly configService: ConfigService) {}

  async translate(text: string, from: Language, to: Language): Promise<string> {
    if (!text.trim()) {
      return '';
    }

    const apiKey = this.configService.get<string>('translate.apiKey');
    if (!apiKey) {
      this.logger.warn(
        `Google Translate is not configured; returning source text as-is (${from}→${to})`,
      );
      return text;
    }

    const res = await fetch(
      `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          q: text,
          source: toLangCode(from),
          target: toLangCode(to),
          format: 'text',
        }),
      },
    );

    if (!res.ok) {
      throw new Error(`Google Translate failed: ${res.status}`);
    }

    const json = (await res.json()) as {
      data?: { translations?: { translatedText?: string }[] };
    };
    const translated = json.data?.translations?.[0]?.translatedText;
    if (!translated) {
      throw new Error('Google Translate returned no translation');
    }
    return translated;
  }
}
