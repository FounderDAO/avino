import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma';
import { UploadsService } from '../uploads';

/** Дефолты sweep'а, если конфиг не задан. */
const DEFAULT_GRACE_HOURS = 24;
const DEFAULT_BATCH_SIZE = 500;
const DEFAULT_DRY_RUN = true;
const DEFAULT_MAX_DELETE_RATIO = 0.5;
/** Ниже этого размера выборки ratio-проверка не применяется (шум малых чисел). */
const MIN_SAMPLE_FOR_RATIO = 20;

/**
 * MediaCleanupService — фоновый sweep осиротевших фото в R2 (ADR-0099).
 *
 * Запускается периодической джобой `cleanup_orphan_media` (MediaCleanupWorker →
 * `media_cleanup_queue`). Перечисляет объекты под префиксом `listings/`, берёт
 * только ключи медиа (`/media/`) старше grace-окна (свежие не трогаем — их
 * DB-строка могла ещё коммититься в момент скана), и удаляет те, для которых нет
 * живой строки в `listing_media`. «Живой ключ» резолвится так же, как в
 * delete-пути: `storageKey ?? extractKey(url)` — чтобы НЕ удалить legacy-объект
 * (storageKey=null), у которого ключ восстанавливается из сохранённого url.
 *
 * Закрывает два источника orphan'ов: (а) упавший best-effort `uploads.delete`
 * при удалении медиа; (б) удачный upload, но упавший `listingMedia.create`.
 */
@Injectable()
export class MediaCleanupService {
  private readonly logger = new Logger(MediaCleanupService.name);
  private readonly graceHours: number;
  private readonly batchSize: number;
  private readonly dryRun: boolean;
  private readonly maxDeleteRatio: number;

  constructor(
    private readonly uploads: UploadsService,
    private readonly prisma: PrismaService,
    configService: ConfigService,
  ) {
    // ?? не защищает от NaN (parseInt('abc')=NaN, NaN ?? default = NaN).
    // Number.isFinite гарантирует фолбэк при любом некорректном значении.
    const grace = configService.get<number>('mediaCleanup.graceHours');
    this.graceHours = Number.isFinite(grace) ? (grace as number) : DEFAULT_GRACE_HOURS;
    const batch = configService.get<number>('mediaCleanup.batchSize');
    this.batchSize = Number.isFinite(batch) ? (batch as number) : DEFAULT_BATCH_SIZE;
    const dry = configService.get<boolean>('mediaCleanup.dryRun');
    this.dryRun = typeof dry === 'boolean' ? dry : DEFAULT_DRY_RUN;
    const ratio = configService.get<number>('mediaCleanup.maxDeleteRatio');
    this.maxDeleteRatio = Number.isFinite(ratio) ? (ratio as number) : DEFAULT_MAX_DELETE_RATIO;
  }

  /**
   * Один проход sweep'а. Возвращает число удалённых orphan-объектов. Ошибка
   * удаления одного объекта логируется и не валит весь прогон.
   */
  async run(): Promise<number> {
    const cutoff = new Date(Date.now() - this.graceHours * 3600_000);

    const root = this.uploads.rootPrefix();
    const listingsRoot = root ? `${root}/listings/` : 'listings/';
    const objects = await this.uploads.listKeys(listingsRoot);
    const candidates = objects
      .filter((o) => o.key.includes('/media/') && o.lastModified < cutoff)
      .slice(0, this.batchSize);
    if (candidates.length === 0) {
      return 0;
    }

    // Множество живых ключей: резолвим ровно как в delete-пути.
    // Запрос ограничен кандидатами (современные строки по storageKey) и legacy-строками
    // (storageKey=null, ключ восстанавливается из url) — полный скан таблицы не нужен.
    const candidateKeys = candidates.map((o) => o.key);
    const rows = await this.prisma.listingMedia.findMany({
      where: {
        OR: [
          { storageKey: { in: candidateKeys } },
          { storageKey: null },
        ],
      },
      select: { storageKey: true, url: true },
    });
    const live = new Set<string>(
      rows.map((r: { storageKey: string | null; url: string }) =>
        r.storageKey ?? this.uploads.extractKey(r.url),
      ),
    );

    const orphans = candidates.filter((o) => !live.has(o.key));

    // Circuit-breaker: аномально высокая доля «сирот» при достаточной выборке =
    // почти наверняка не та/пустая база или чужой бакет → прерываемся.
    if (
      candidates.length >= MIN_SAMPLE_FOR_RATIO &&
      orphans.length / candidates.length > this.maxDeleteRatio
    ) {
      this.logger.error(
        `ABORT media cleanup: ${orphans.length}/${candidates.length} objects under ` +
          `${listingsRoot} look orphaned (> ${this.maxDeleteRatio}). ` +
          `Wrong DB/bucket or missing S3_KEY_PREFIX? Deleting nothing.`,
      );
      return 0;
    }

    if (this.dryRun) {
      this.logger.warn(
        `[DRY-RUN] media cleanup would delete ${orphans.length} orphan object(s) under ` +
          `${listingsRoot}` +
          (orphans.length
            ? `; sample: ${orphans.slice(0, 5).map((o) => o.key).join(', ')}`
            : ''),
      );
      return 0;
    }

    let deleted = 0;
    for (const obj of orphans) {
      try {
        await this.uploads.delete(obj.key);
        deleted += 1;
      } catch (error) {
        this.logger.warn(
          `Failed to delete orphan object ${obj.key}: ${String(error)}`,
        );
      }
    }
    if (deleted > 0) {
      this.logger.log(`Deleted ${deleted} orphan media object(s)`);
    }
    return deleted;
  }
}
