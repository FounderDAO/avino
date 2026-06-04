import { Inject, Injectable, Logger } from '@nestjs/common';
import { Language, ListingStatus, Prisma } from '@prisma/client';
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

const AUTHOR_TRANSLATION_SELECT = {
  language: true,
  title: true,
  description: true,
  addressNote: true,
  featuresText: true,
} as const;

/**
 * ListingAutoTranslator — машинный перевод объявления на остальные языки
 * (TASK-071, ADR-005). Чистая бизнес-логика воркера, отделённая от транспорта
 * BullMQ ({@link TranslationWorker}) ради юнит-тестируемости.
 *
 * Идемпотентен: переводы пишутся через `upsert` по уникальному ключу
 * `(listing_id, language)`, поэтому повторный запуск (ретрай джобы, ре-публикация)
 * безопасен. Источник строки — провайдер ({@link TranslationProvider}), признак
 * `is_auto_translated=true`. Переводится только авторская строка на
 * `original_language`; исходный язык пропускается.
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
   * Перевести объявление `listingId` на остальные языки. Джоба ставится после
   * APPROVE→ACTIVE (ModerationService). Мягко пропускает листинг, если он исчез,
   * больше не ACTIVE или авторская строка отсутствует — чтобы устаревшая джоба
   * не падала и не ретраилась впустую.
   */
  async run(listingId: string): Promise<void> {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: {
        status: true,
        originalLanguage: true,
        translations: { select: AUTHOR_TRANSLATION_SELECT },
      },
    });

    if (!listing || listing.status !== ListingStatus.ACTIVE) {
      this.logger.debug(
        `Skipping auto-translation for ${listingId}: missing or not ACTIVE`,
      );
      return;
    }

    const author = listing.translations.find(
      (t) => t.language === listing.originalLanguage,
    );
    if (!author) {
      this.logger.warn(
        `Listing ${listingId} has no author translation row; skipping`,
      );
      return;
    }

    const from = listing.originalLanguage;
    const targets = ALL_LANGUAGES.filter((lang) => lang !== from);

    for (const to of targets) {
      const data = {
        title: await this.translate(author.title, from, to),
        description: await this.translateNullable(author.description, from, to),
        addressNote: await this.translateNullable(author.addressNote, from, to),
        featuresText: await this.translateNullable(
          author.featuresText,
          from,
          to,
        ),
      };

      await this.prisma.listingTranslation.upsert({
        where: { listingId_language: { listingId, language: to } },
        create: {
          listingId,
          language: to,
          source: this.provider.source,
          isAutoTranslated: true,
          ...data,
        },
        update: {
          source: this.provider.source,
          isAutoTranslated: true,
          ...data,
        },
      });
    }

    this.logger.log(
      `Auto-translated listing ${listingId} into ${targets.join(', ')}`,
    );
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

/** Тип авторской строки, нужной для перевода (см. {@link AUTHOR_TRANSLATION_SELECT}). */
export type AuthorTranslation = Prisma.ListingTranslationGetPayload<{
  select: typeof AUTHOR_TRANSLATION_SELECT;
}>;
