import { Inject, Injectable, Logger } from '@nestjs/common';
import { Language, ListingStatus } from '@prisma/client';
import { PrismaService } from '../prisma';
import {
  TRANSLATION_PROVIDER,
  TranslationProvider,
} from './providers/translation-provider.interface';

/** Все поддерживаемые языки (CLAUDE.md §9): объявление переводится на остальные. */
const ALL_LANGUAGES: readonly Language[] = [
  Language.UZ,
  Language.RU,
  Language.EN,
];

const TRANSLATION_STATE_SELECT = {
  language: true,
  title: true,
  description: true,
  addressNote: true,
  featuresText: true,
  isAutoTranslated: true,
} as const;

/**
 * ListingAutoTranslator — машинный перевод объявления на остальные языки
 * (TASK-071, ADR-0091). Чистая бизнес-логика, отделённая от транспорта
 * ради юнит-тестируемости.
 *
 * Идемпотентен: переводы пишутся через `upsert` по уникальному ключу
 * `(listing_id, language)`. Зовётся синхронно из admin-эндпоинта генерации.
 * Работает для любого НЕ-DELETED листинга (модератор триггерит на NEW).
 * Целевой язык со строкой is_auto_translated=false (ручная правка модератора /
 * авторский оригинал) НЕ перезаписывается.
 */
@Injectable()
export class ListingAutoTranslator {
  private readonly logger = new Logger(ListingAutoTranslator.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(TRANSLATION_PROVIDER)
    private readonly provider: TranslationProvider,
  ) {}

  /**
   * Сгенерировать машинный перевод объявления на остальные языки (ADR-0091).
   * Зовётся синхронно из admin-эндпоинта генерации. Работает для любого
   * НЕ-DELETED листинга (модератор триггерит на NEW). Идемпотентно (upsert).
   * Целевой язык со строкой is_auto_translated=false (ручная правка модератора /
   * авторский оригинал) НЕ перезаписывается.
   */
  async generateTranslations(listingId: string): Promise<void> {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: {
        status: true,
        originalLanguage: true,
        translations: { select: TRANSLATION_STATE_SELECT },
      },
    });

    if (!listing || listing.status === ListingStatus.DELETED) {
      this.logger.debug(`Skipping translation for ${listingId}: missing or DELETED`);
      return;
    }

    const author = listing.translations.find(
      (t) => t.language === listing.originalLanguage,
    );
    if (!author) {
      this.logger.warn(`Listing ${listingId} has no author translation row; skipping`);
      return;
    }

    const from = listing.originalLanguage;
    const targets = ALL_LANGUAGES.filter((lang) => lang !== from);

    for (const to of targets) {
      const existing = listing.translations.find((t) => t.language === to);
      if (existing && !existing.isAutoTranslated) {
        this.logger.debug(`Preserving manual translation ${listingId}/${to}`);
        continue;
      }

      const data = {
        title: await this.translate(author.title, from, to),
        description: await this.translateNullable(author.description, from, to),
        addressNote: await this.translateNullable(author.addressNote, from, to),
        featuresText: await this.translateNullable(author.featuresText, from, to),
      };

      await this.prisma.listingTranslation.upsert({
        where: { listingId_language: { listingId, language: to } },
        create: { listingId, language: to, source: this.provider.source, isAutoTranslated: true, ...data },
        update: { source: this.provider.source, isAutoTranslated: true, ...data },
      });
    }

    this.logger.log(`Generated translations for listing ${listingId}`);
  }

  private translate(
    text: string,
    from: Language,
    to: Language,
  ): Promise<string> {
    return this.provider.translate(text, from, to);
  }

  /** Не вызывать провайдер для отсутствующих (null) необязательных полей. */
  private async translateNullable(
    text: string | null,
    from: Language,
    to: Language,
  ): Promise<string | null> {
    if (text === null) {
      return null;
    }
    return this.provider.translate(text, from, to);
  }
}
