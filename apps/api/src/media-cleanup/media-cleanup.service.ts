import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma';
import { UploadsService } from '../uploads';

/** Дефолты sweep'а, если конфиг не задан. */
const DEFAULT_GRACE_HOURS = 24;
const DEFAULT_BATCH_SIZE = 500;

/**
 * MediaCleanupService — фоновый sweep осиротевших фото в R2 (ADR-XXXX).
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

  constructor(
    private readonly uploads: UploadsService,
    private readonly prisma: PrismaService,
    configService: ConfigService,
  ) {
    this.graceHours =
      configService.get<number>('mediaCleanup.graceHours') ?? DEFAULT_GRACE_HOURS;
    this.batchSize =
      configService.get<number>('mediaCleanup.batchSize') ?? DEFAULT_BATCH_SIZE;
  }

  /**
   * Один проход sweep'а. Возвращает число удалённых orphan-объектов. Ошибка
   * удаления одного объекта логируется и не валит весь прогон.
   */
  async run(): Promise<number> {
    const cutoff = new Date(Date.now() - this.graceHours * 3600_000);

    const objects = await this.uploads.listKeys('listings/');
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

    let deleted = 0;
    for (const obj of candidates) {
      if (live.has(obj.key)) {
        continue;
      }
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
