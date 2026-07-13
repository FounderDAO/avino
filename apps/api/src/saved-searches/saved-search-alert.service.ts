import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { EmailService } from '../email';
import { NotificationsService } from '../notifications';
import { PrismaService } from '../prisma';
import { SavedSearchMatch, SearchService } from '../search';

/** Число сохранённых поисков, обрабатываемых за один прогон (если конфиг пуст). */
const DEFAULT_BATCH_SIZE = 100;

/** Потолок алертов на один поиск за прогон (если конфиг пуст). */
const DEFAULT_MAX_LISTINGS = 50;

/** Один активный сохранённый поиск, выбранный для проверки. */
interface SavedSearchRow {
  id: string;
  userId: string;
  name: string;
  filtersJson: Prisma.JsonValue;
  lastCheckedAt: Date | null;
  createdAt: Date;
  user: { email: string | null };
}

/**
 * SavedSearchAlertService — polling-матчер сохранённых поисков (TASK-102,
 * ARCHITECTURE §16).
 *
 * Запускается периодической джобой `check_saved_searches`
 * ({@link SavedSearchWorker} → `saved_search_queue`). Один прогон перебирает
 * активные поиски (до `batchSize`, самые «протухшие» по `last_checked_at` —
 * первыми) и по каждому:
 *
 *  1. находит ACTIVE-листинги, удовлетворяющие фильтрам и ставшие видимыми с
 *     прошлой проверки — окно `(last_checked_at ?? created_at, runAt]` по
 *     `published_at` ({@link SearchService.matchNewlyActiveListings}); только
 *     `ACTIVE` (acceptance «only ACTIVE listings trigger alerts»);
 *  2. атомарно (одна транзакция): двигает `last_checked_at` (idempotent
 *     optimistic-гард — если конкурентный прогон уже сдвинул watermark, строка
 *     пропускается, дублей нет) и ставит PENDING-уведомление на каждое новое
 *     совпадение ({@link NotificationsService});
 *  3. после коммита ставит дайджест-письмо владельцу в `email_queue`
 *     ({@link EmailService}, acceptance «email notification is queued») — одно
 *     письмо на поиск за прогон (а не на каждое объявление), best-effort:
 *     in-app-уведомления и watermark — источник истины, потеря письма не плодит
 *     дубли.
 *
 * Дедупликация (acceptance «duplicate alerts are avoided») держится на
 * полуоткрытом окне `published_at` + продвижке watermark в той же транзакции:
 * листинг попадает ровно в одно окно. Целевая архитектура (reverse-matching при
 * публикации листинга, ARCHITECTURE §16) заменит polling без изменения API.
 */
@Injectable()
export class SavedSearchAlertService {
  private readonly logger = new Logger(SavedSearchAlertService.name);
  private readonly batchSize: number;
  private readonly maxListings: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly search: SearchService,
    private readonly notifications: NotificationsService,
    private readonly email: EmailService,
    configService: ConfigService,
  ) {
    this.batchSize =
      configService.get<number>('savedSearch.alertBatchSize') ??
      DEFAULT_BATCH_SIZE;
    this.maxListings =
      configService.get<number>('savedSearch.alertMaxListings') ??
      DEFAULT_MAX_LISTINGS;
  }

  /**
   * Прогнать один матчинг: проверить активные поиски и поставить алерты по новым
   * совпадениям. Возвращает суммарное число поставленных алертов. Ошибка по
   * одному поиску логируется и не валит весь прогон — остальные обрабатываются.
   */
  async run(): Promise<number> {
    const runAt = new Date();
    const searches = (await this.prisma.savedSearch.findMany({
      where: { isActive: true },
      select: {
        id: true,
        userId: true,
        name: true,
        filtersJson: true,
        lastCheckedAt: true,
        createdAt: true,
        user: { select: { email: true } },
      },
      orderBy: [{ lastCheckedAt: { sort: 'asc', nulls: 'first' } }, { id: 'asc' }],
      take: this.batchSize,
    })) as SavedSearchRow[];

    let alerted = 0;
    for (const search of searches) {
      try {
        alerted += await this.checkOne(search, runAt);
      } catch (error) {
        this.logger.error(
          `Failed to check saved search ${search.id}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }

    if (alerted > 0) {
      this.logger.log(`Emitted ${alerted} saved-search alert(s)`);
    }
    return alerted;
  }

  /**
   * Проверить один сохранённый поиск. Возвращает число поставленных алертов
   * (`0`, если новых совпадений нет или watermark перехватил конкурентный прогон).
   */
  private async checkOne(
    search: SavedSearchRow,
    runAt: Date,
  ): Promise<number> {
    // Floor для первой проверки — created_at: не рассылаем алерты по всему
    // бэклогу ACTIVE-листингов, только по появившимся с момента создания поиска.
    const since = search.lastCheckedAt ?? search.createdAt;
    const filters = this.extractFilters(search.filtersJson);

    const matches = await this.search.matchNewlyActiveListings(
      filters,
      since,
      runAt,
      this.maxListings,
    );

    // При усечении (совпадений >= потолка) двигаем watermark не на runAt, а на
    // published_at последнего обработанного — остаток подхватит следующий прогон
    // (без дублей и без потери алертов).
    const capped = matches.length === this.maxListings;
    const watermark = capped
      ? (matches[matches.length - 1] as SavedSearchMatch).publishedAt
      : runAt;

    const created = await this.prisma.$transaction(async (tx) => {
      // Optimistic-гард продвижки watermark: обновляем только если last_checked_at
      // не сдвинул конкурентный прогон (иначе откатываемся и не плодим алерты).
      const advance = await tx.savedSearch.updateMany({
        where: { id: search.id, lastCheckedAt: search.lastCheckedAt },
        data: { lastCheckedAt: watermark },
      });
      if (advance.count === 0) {
        return 0;
      }

      for (const match of matches) {
        await this.notifications.queueSavedSearchNewListing(tx, search.userId, {
          savedSearchId: search.id,
          savedSearchName: search.name,
          listingId: match.id,
        });
      }
      return matches.length;
    });

    if (created > 0) {
      if (capped) {
        this.logger.warn(
          `Saved search ${search.id} matched >= ${this.maxListings} listings; ` +
            'watermark advanced to last match, remainder picked up next run',
        );
      }
      await this.enqueueDigest(search, created);
    }
    return created;
  }

  /**
   * Дайджест-письмо владельцу: одно письмо на сохранённый поиск за прогон.
   * Best-effort — сбой постановки в очередь логируется, но не валит алерт (в-app
   * уведомления и watermark уже зафиксированы). Без email у владельца письмо
   * пропускается (in-app-запись остаётся).
   */
  private async enqueueDigest(
    search: SavedSearchRow,
    count: number,
  ): Promise<void> {
    const email = search.user.email;
    if (!email) {
      this.logger.debug(
        `Saved search ${search.id} owner has no email; skipping digest`,
      );
      return;
    }
    try {
      await this.email.sendEmail({
        to: email,
        subject: `Avino — новые объявления по поиску «${search.name}»`,
        text:
          `По вашему сохранённому поиску «${search.name}» ` +
          `найдено новых объявлений: ${count}.`,
      });
    } catch (error) {
      this.logger.error(
        `Failed to enqueue saved-search digest for ${search.id}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /**
   * Достать `filters` из версионированного контейнера `filters_json`
   * (`{ schemaVersion, filters }`) толерантно к версии (ARCHITECTURE §16: матчер
   * не ломается на старых схемах). Отбрасывает `null`/`undefined`-значения, чтобы
   * не сформировать условие `column = NULL` (совпадений всегда ноль). Невалидный
   * контейнер → пустые фильтры (матч по всем ACTIVE в окне).
   *
   * TASK-253: сырой путь идёт в обход DTO `@Transform(toArray)`, а клиент
   * исторически пишет scalar-строки (`property_type: "HOUSE"`) и plural-ключи
   * (`property_types`, `parking_types`). Без нормализации `Prisma.join(строка)`
   * в {@link SearchService.buildWhereSql} падает с «r.reduce is not a function»
   * (алерты по поиску не шлются, watermark не двигается). Поэтому array-поля
   * приводятся к массивам: `property_types`/`parking_types` имеют приоритет над
   * одиночным legacy-значением (клиент кладёт в него только ПЕРВЫЙ выбор).
   */
  private extractFilters(
    filtersJson: Prisma.JsonValue,
  ): Record<string, unknown> {
    if (
      filtersJson === null ||
      typeof filtersJson !== 'object' ||
      Array.isArray(filtersJson)
    ) {
      return {};
    }
    const inner = (filtersJson as Record<string, unknown>).filters;
    if (inner === null || typeof inner !== 'object' || Array.isArray(inner)) {
      return {};
    }

    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(inner as Record<string, unknown>)) {
      if (value !== null && value !== undefined) {
        sanitized[key] = value;
      }
    }

    const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : [v]);
    // plural-ключ клиента → канонический ключ buildWhereSql (plural удаляется,
    // чтобы не утёк в SQL-слой); одиночное legacy-значение — фолбэк.
    for (const [plural, canonical] of [
      ['property_types', 'property_type'],
      ['parking_types', 'parking_type'],
    ] as const) {
      if (sanitized[plural] !== undefined) {
        sanitized[canonical] = asArray(sanitized[plural]);
        delete sanitized[plural];
      } else if (sanitized[canonical] !== undefined) {
        sanitized[canonical] = asArray(sanitized[canonical]);
      }
    }
    for (const key of ['amenities', 'listing_source'] as const) {
      if (sanitized[key] !== undefined) {
        sanitized[key] = asArray(sanitized[key]);
      }
    }
    return sanitized;
  }
}
