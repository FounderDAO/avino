import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Language,
  ListingStatus,
  Prisma,
  TranslationSource,
} from '@prisma/client';
import { UserRole } from '@avino/shared';
import { ApiErrorCode } from '../common/dto/error-response.dto';
import { AuthenticatedUser } from '../common/guards';
import { PrismaService } from '../prisma';

/** Авторский перевод из DTO (snake_case) — общий для create/update листинга. */
export interface ListingTranslationInput {
  title: string;
  description?: string | null;
  address_note?: string | null;
  features_text?: string | null;
}

/**
 * Строка перевода, отдаваемая `GET /api/v1/listings/:id/translations` (API.md §7).
 * Управленческий вид (владелец/MODERATOR/ADMIN), поэтому включает `source` и
 * `is_auto_translated` — видно, где авторский текст, а где машинный перевод.
 */
export interface ListingTranslationItem {
  language: Language;
  source: TranslationSource;
  is_auto_translated: boolean;
  title: string;
  description: string | null;
  address_note: string | null;
  features_text: string | null;
}

/** Ответ `GET /api/v1/listings/:id/translations` — все переводы листинга. */
export interface ListingTranslationsResponse {
  listing_id: string;
  original_language: Language;
  translations: ListingTranslationItem[];
}

const TRANSLATION_SELECT = {
  language: true,
  source: true,
  isAutoTranslated: true,
  title: true,
  description: true,
  addressNote: true,
  featuresText: true,
} as const;

type TranslationRow = Prisma.ListingTranslationGetPayload<{
  select: typeof TRANSLATION_SELECT;
}>;

/** Минимум полей перевода, нужный для резолва языка (язык + наличие строки). */
interface LanguageCarrier {
  language: Language;
}

/** Роли, видящие все переводы листинга наравне с владельцем (API.md §7). */
const TRANSLATIONS_VIEW_ROLES: readonly UserRole[] = [
  UserRole.MODERATOR,
  UserRole.ADMIN,
];

/**
 * TranslationsService — хранение и выдача переводов объявления (TASK-070, M7).
 *
 * Единый источник логики переводов: формирование авторской строки на
 * `original_language` при создании листинга ({@link buildOriginalTranslationInput}),
 * выбор языка ответа с фолбэком на `original_language`
 * ({@link resolveLanguage}, ADR-005/012) и выдача всех переводов владельцу/модерации
 * ({@link listByListing}). Авто-перевод на остальные языки (Google/Yandex,
 * `translation_queue`) — отдельная задача TASK-071; здесь только storage/retrieval.
 */
@Injectable()
export class TranslationsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Nested `create`-данные авторского перевода (source=USER, не авто-переведён) на
   * `original_language`. Используется при создании листинга — единственная строка
   * перевода, существующая до модерации/авто-перевода (CLAUDE.md §9, ADR-005).
   */
  buildOriginalTranslationInput(
    originalLanguage: Language,
    translation: ListingTranslationInput,
  ): Prisma.ListingTranslationCreateWithoutListingInput {
    return {
      language: originalLanguage,
      source: TranslationSource.USER,
      isAutoTranslated: false,
      title: translation.title,
      description: translation.description ?? null,
      addressNote: translation.address_note ?? null,
      featuresText: translation.features_text ?? null,
    };
  }

  /**
   * Выбрать язык ответа: приоритет у `?lang`, затем `Accept-Language`, фолбэк —
   * `original_language` (ADR-005/012). Учитываются только языки, для которых
   * перевод реально существует (машинные переводы появляются после ACTIVE).
   * Крайний случай (нет строки на `original_language`) — первая доступная.
   */
  resolveLanguage(
    translations: readonly LanguageCarrier[],
    originalLanguage: Language,
    langParam?: string,
    acceptLanguage?: string,
  ): Language {
    const available = new Set(translations.map((t) => t.language));
    const candidates = [
      this.normalizeLanguage(langParam),
      ...this.parseAcceptLanguage(acceptLanguage),
    ];
    for (const candidate of candidates) {
      if (candidate && available.has(candidate)) {
        return candidate;
      }
    }
    if (available.has(originalLanguage)) {
      return originalLanguage;
    }
    return translations[0]?.language ?? originalLanguage;
  }

  /**
   * `GET /api/v1/listings/:id/translations` — все переводы листинга (API.md §7).
   * Auth: владелец / MODERATOR / ADMIN. Отсутствующий или DELETED листинг → `404`
   * (исключён из всех read-path); аутентифицированный посторонний → `403`.
   */
  async listByListing(
    listingId: string,
    viewer: AuthenticatedUser,
  ): Promise<ListingTranslationsResponse> {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: {
        ownerId: true,
        status: true,
        originalLanguage: true,
        translations: {
          select: TRANSLATION_SELECT,
          orderBy: { language: Prisma.SortOrder.asc },
        },
      },
    });

    if (!listing || listing.status === ListingStatus.DELETED) {
      throw new NotFoundException({
        code: ApiErrorCode.NOT_FOUND,
        message: 'Listing not found',
      });
    }
    if (
      listing.ownerId !== viewer.id &&
      !viewer.roles.some((role) => TRANSLATIONS_VIEW_ROLES.includes(role))
    ) {
      throw new ForbiddenException({
        code: ApiErrorCode.FORBIDDEN,
        message: 'You can only view translations of your own listing',
      });
    }

    return {
      listing_id: listingId,
      original_language: listing.originalLanguage,
      translations: listing.translations.map((t) => this.toItem(t)),
    };
  }

  /** Строка перевода в snake_case для ответа эндпоинта. */
  private toItem(t: TranslationRow): ListingTranslationItem {
    return {
      language: t.language,
      source: t.source,
      is_auto_translated: t.isAutoTranslated,
      title: t.title,
      description: t.description,
      address_note: t.addressNote,
      features_text: t.featuresText,
    };
  }

  /** Нормализовать строку языка (`ru`/`RU`) к enum `Language` либо `null`. */
  private normalizeLanguage(value: string | undefined): Language | null {
    if (!value) {
      return null;
    }
    const upper = value.trim().toUpperCase();
    return (Object.values(Language) as string[]).includes(upper)
      ? (upper as Language)
      : null;
  }

  /** Языки из `Accept-Language` по убыванию приоритета (q-веса игнорируются). */
  private parseAcceptLanguage(header: string | undefined): Language[] {
    if (!header) {
      return [];
    }
    return header
      .split(',')
      .map((part) => this.normalizeLanguage(part.split(';')[0]?.split('-')[0]))
      .filter((lang): lang is Language => lang !== null);
  }

  /**
   * `PATCH /api/v1/admin/listings/:id/translations/:language` (ADR-0091).
   * Ручная правка перевода модератором: upsert строки с `isAutoTranslated=false`.
   * Auth: MODERATOR / ADMIN (гейтируется контроллером).
   * Ошибки: `404` — листинг отсутствует или DELETED; `422` — попытка изменить
   * оригинальный язык листинга (который управляется через update-листинг).
   */
  async updateModeratorTranslation(
    listingId: string,
    language: Language,
    input: ListingTranslationInput,
  ): Promise<void> {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: { originalLanguage: true, status: true },
    });
    if (!listing || listing.status === ListingStatus.DELETED) {
      throw new NotFoundException({
        code: ApiErrorCode.NOT_FOUND,
        message: 'Listing not found',
      });
    }
    if (language === listing.originalLanguage) {
      throw new HttpException(
        {
          code: ApiErrorCode.VALIDATION_ERROR,
          message: 'Cannot edit the original-language translation',
        },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    // create-branch: always write full object (no existing row to preserve).
    const createFields = {
      title: input.title,
      description: input.description ?? null,
      addressNote: input.address_note ?? null,
      featuresText: input.features_text ?? null,
    };

    // update-branch: partial-update semantics — only include fields present in
    // input (i.e. !== undefined) so that omitting address_note/features_text
    // does not overwrite machine-translated data with null (ADR-0091 data-loss fix).
    const updateFields: Prisma.ListingTranslationUpdateInput = {
      isAutoTranslated: false,
      title: input.title,
    };
    if (input.description !== undefined) updateFields.description = input.description;
    if (input.address_note !== undefined) updateFields.addressNote = input.address_note;
    if (input.features_text !== undefined) updateFields.featuresText = input.features_text;

    await this.prisma.listingTranslation.upsert({
      where: { listingId_language: { listingId, language } },
      create: {
        listingId,
        language,
        source: TranslationSource.USER,
        isAutoTranslated: false,
        ...createFields,
      },
      update: updateFields,
    });
  }

  /**
   * `PATCH /api/v1/admin/listings/:id/original` (ADR-0156). Правка авторского
   * оригинала модератором: текст + язык, на котором он реально написан.
   * Auth: MODERATOR / ADMIN (гейтируется контроллером).
   *
   * Единственный путь исправить листинг, у которого автор выбрал неверный язык
   * оригинала (написал по-русски, пометил как EN): смена `newLanguage` переносит
   * авторский текст в правильный языковой слот. В этом случае ВСЕ производные
   * переводы (сделанные из неверного источника) удаляются — остаётся единственная
   * строка `source=USER` на новом языке, из которой «Сгенерировать переводы»
   * заполнит пустые языки. При совпадении языка — просто обновляется текст
   * оригинала (типовая правка опечаток перед генерацией).
   *
   * Строка оригинала перезаписывается ПОЛНОСТЬЮ (не partial, в отличие от
   * {@link updateModeratorTranslation}): это авторский текст целиком, UI шлёт весь
   * набор полей (правленые + сквозные `address_note`/`features_text`).
   *
   * Ошибки: `404` — листинг отсутствует или DELETED.
   */
  async updateOriginalTranslation(
    listingId: string,
    newLanguage: Language,
    input: ListingTranslationInput,
  ): Promise<void> {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: { originalLanguage: true, status: true },
    });
    if (!listing || listing.status === ListingStatus.DELETED) {
      throw new NotFoundException({
        code: ApiErrorCode.NOT_FOUND,
        message: 'Listing not found',
      });
    }

    const authorRow = {
      source: TranslationSource.USER,
      isAutoTranslated: false,
      title: input.title,
      description: input.description ?? null,
      addressNote: input.address_note ?? null,
      featuresText: input.features_text ?? null,
    };

    await this.prisma.$transaction(async (tx) => {
      if (newLanguage !== listing.originalLanguage) {
        // Смена языка оригинала: производные переводы были сделаны из неверного
        // источника → удаляем все строки, кроме будущего нового оригинала.
        await tx.listingTranslation.deleteMany({
          where: { listingId, language: { not: newLanguage } },
        });
        await tx.listing.update({
          where: { id: listingId },
          data: { originalLanguage: newLanguage },
        });
      }
      await tx.listingTranslation.upsert({
        where: { listingId_language: { listingId, language: newLanguage } },
        create: { listingId, language: newLanguage, ...authorRow },
        update: authorRow,
      });
    });
  }
}
