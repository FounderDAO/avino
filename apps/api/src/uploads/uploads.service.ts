import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * UploadsService — абстракция загрузки файлов в S3-compatible storage
 * (TASK-060, ARCHITECTURE §14, CLAUDE.md §3).
 *
 * Контракт намеренно узкий и client-agnostic: вызывающий код (будущий
 * ListingMediaModule, TASK-061) передаёт буфер + MIME-тип и получает обратно
 * `{ key, url }`. Детали провайдера (endpoint, path-style, ACL, presign)
 * инкапсулированы здесь.
 *
 * Хранилище:
 * - Файлы хранятся ТОЛЬКО в S3, никогда на диске API (ARCHITECTURE §14,
 *   ENV §9). Локального постоянного хранилища нет — если S3 не сконфигурирован,
 *   сервис бросает ошибку, а не пишет на FS.
 *
 * URL по конфигурации (acceptance TASK-060):
 * - задан `S3_PUBLIC_BASE_URL` → объекты публичны (public-read ACL),
 *   `getObjectUrl` возвращает прямой публичный URL (CDN/bucket);
 * - не задан → приватный bucket, `getObjectUrl` возвращает короткоживущий
 *   presigned GET URL (TTL = `S3_SIGNED_URL_TTL`).
 *
 * EXIF-стриппинг и генерация thumbnail выполняются не здесь, а в
 * media_processing_queue (process_uploaded_image, ARCHITECTURE §14 п.3).
 */
@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);
  private cachedClient: S3Client | null = null;

  constructor(private readonly configService: ConfigService) {}

  /**
   * Загрузить буфер в S3.
   *
   * @param params.buffer      содержимое файла;
   * @param params.contentType MIME-тип (валидация allow-list — на слое вызова,
   *                           TASK-061);
   * @param params.key         явный ключ объекта; если не задан — генерируется
   *                           (`<prefix>/<uuid><ext>`);
   * @param params.prefix      префикс-«папка» для сгенерированного ключа
   *                           (по умолчанию `uploads`);
   * @param params.extension   расширение для сгенерированного ключа (напр. `.jpg`).
   * @returns ключ объекта и его URL (публичный или presigned — по конфигу).
   */
  async upload(params: {
    buffer: Buffer;
    contentType: string;
    key?: string;
    prefix?: string;
    extension?: string;
  }): Promise<{ key: string; url: string }> {
    const { buffer, contentType } = params;
    const key = params.key ?? this.generateKey(params.prefix, params.extension);

    const client = this.getClient();
    await client.send(
      new PutObjectCommand({
        Bucket: this.bucket(),
        Key: key,
        Body: buffer,
        ContentType: contentType,
        // Публичный режим требует public-read, чтобы прямой URL работал без
        // подписи; приватный bucket остаётся закрытым (presigned-доступ).
        ACL: this.isPublic() ? 'public-read' : undefined,
      }),
    );

    return { key, url: await this.getObjectUrl(key) };
  }

  /**
   * URL объекта по ключу: публичный (если задан `S3_PUBLIC_BASE_URL`) либо
   * presigned GET URL для приватного bucket.
   */
  async getObjectUrl(key: string): Promise<string> {
    const publicBaseUrl = this.configService.get<string>('s3.publicBaseUrl');
    if (publicBaseUrl) {
      return `${publicBaseUrl.replace(/\/+$/, '')}/${key}`;
    }

    const ttl = this.configService.get<number>('s3.signedUrlTtl') ?? 3600;
    return getSignedUrl(
      this.getClient(),
      new GetObjectCommand({ Bucket: this.bucket(), Key: key }),
      { expiresIn: ttl },
    );
  }

  /**
   * URL для ОТДАЧИ медиа клиенту — всегда свежий (ADR-0086). В приватном режиме это
   * заново-подписанный presigned GET URL, в публичном — постоянный CDN-URL. Так как
   * подпись выписывается ПРИ КАЖДОМ ЧТЕНИИ, она физически не успевает протухнуть —
   * в отличие от прежней схемы, где presigned URL пёкся один раз при загрузке и
   * через `S3_SIGNED_URL_TTL` отдавал `403 ExpiredRequest`.
   *
   * @param storageKey стабильный object key из БД (`listing_media.storage_key`);
   * @param fallbackUrl сохранённый `url` — фолбэк для legacy-строк без `storage_key`:
   *                    ключ восстанавливается из него {@link extractKey} (query/
   *                    base-URL отбрасываются). Работает и для presigned, и для
   *                    публичных URL.
   */
  async resolveMediaUrl(
    storageKey: string | null | undefined,
    fallbackUrl: string,
  ): Promise<string> {
    const key = storageKey ?? this.extractKey(fallbackUrl);
    return this.getObjectUrl(key);
  }

  /**
   * Перечислить все объекты под префиксом (пагинация ListObjectsV2). Для
   * media-cleanup воркера (чистка осиротевших объектов). Возвращает ключ и время
   * последней модификации — последнее нужно для grace-окна.
   */
  async listKeys(
    prefix: string,
  ): Promise<Array<{ key: string; lastModified: Date }>> {
    const client = this.getClient();
    const out: Array<{ key: string; lastModified: Date }> = [];
    let token: string | undefined;
    do {
      const res = await client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket(),
          Prefix: prefix,
          ContinuationToken: token,
        }),
      );
      for (const obj of res.Contents ?? []) {
        if (obj.Key) {
          out.push({ key: obj.Key, lastModified: obj.LastModified ?? new Date(0) });
        }
      }
      token = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (token);
    return out;
  }

  /** Удалить объект (для очистки orphaned media, ARCHITECTURE §14 п.4). */
  async delete(key: string): Promise<void> {
    const client = this.getClient();
    await client.send(
      new DeleteObjectCommand({ Bucket: this.bucket(), Key: key }),
    );
  }

  /**
   * Корень-неймспейс ключей среды (`S3_KEY_PREFIX`). Используется upload'ом и
   * media-cleanup, чтобы каждая среда писала/сметала ТОЛЬКО своё поддерево
   * `{prefix}/listings/...` — изоляция при общем бакете. Пусто → плоский `listings/`.
   */
  rootPrefix(): string {
    return this.configService.get<string>('s3.keyPrefix') ?? '';
  }

  /** Публичный режим включён, если задан базовый публичный URL/CDN. */
  private isPublic(): boolean {
    return Boolean(this.configService.get<string>('s3.publicBaseUrl'));
  }

  private generateKey(prefix = 'uploads', extension = ''): string {
    const ext = extension ? (extension.startsWith('.') ? extension : `.${extension}`) : '';
    const normalizedPrefix = prefix.replace(/^\/+|\/+$/g, '');
    return `${normalizedPrefix}/${randomUUID()}${ext.toLowerCase()}`;
  }

  /** Расширение из исходного имени файла (helper для вызывающего кода). */
  extensionFromFilename(filename: string): string {
    return extname(filename).toLowerCase();
  }

  /**
   * Обратное к {@link getObjectUrl} в публичном режиме: вычислить ключ объекта из
   * сохранённого URL. `listing_media.url` хранит URL, а не ключ (DB_SCHEMA §6),
   * поэтому для удаления файла из S3 (ListingMediaService, TASK-061) ключ нужно
   * восстановить. Поддерживаются:
   * - публичный base-URL/CDN (`S3_PUBLIC_BASE_URL`) — отрезается префикс базы;
   * - path-style URL — отрезается сегмент бакета в начале пути.
   * Query-строка (на случай presigned URL) отбрасывается.
   */
  extractKey(url: string): string {
    const publicBaseUrl = this.configService.get<string>('s3.publicBaseUrl');
    if (publicBaseUrl) {
      const base = publicBaseUrl.replace(/\/+$/, '');
      if (url.startsWith(`${base}/`)) {
        return url.slice(base.length + 1).split('?')[0];
      }
    }

    let pathname: string;
    try {
      pathname = new URL(url).pathname;
    } catch {
      pathname = url;
    }
    let key = pathname.replace(/^\/+/, '').split('?')[0];
    const bucket = this.configService.get<string>('s3.bucket');
    if (bucket && key.startsWith(`${bucket}/`)) {
      key = key.slice(bucket.length + 1);
    }
    return key;
  }

  private bucket(): string {
    const bucket = this.configService.get<string>('s3.bucket');
    if (!bucket) {
      throw new Error('S3 storage is not configured: S3_BUCKET is required');
    }
    return bucket;
  }

  /**
   * Ленивая инициализация S3-клиента. Креды обязательны — фолбэка на локальный
   * диск нет (acceptance TASK-060: «No local permanent storage is used»).
   */
  private getClient(): S3Client {
    if (this.cachedClient) {
      return this.cachedClient;
    }

    const endpoint = this.configService.get<string>('s3.endpoint');
    const region = this.configService.get<string>('s3.region') ?? 'us-east-1';
    const accessKeyId = this.configService.get<string>('s3.accessKeyId');
    const secretAccessKey =
      this.configService.get<string>('s3.secretAccessKey');
    const forcePathStyle =
      this.configService.get<boolean>('s3.forcePathStyle') ?? true;

    if (!accessKeyId || !secretAccessKey) {
      throw new Error(
        'S3 storage is not configured: S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY are required',
      );
    }

    this.cachedClient = new S3Client({
      region,
      forcePathStyle,
      credentials: { accessKeyId, secretAccessKey },
      // endpoint опционален: пусто → нативный AWS S3; задан → S3-compatible
      // (MinIO/DigitalOcean Spaces и т.п.).
      ...(endpoint ? { endpoint } : {}),
    });
    this.logger.log(
      `S3 client initialized (endpoint=${endpoint ?? 'aws-default'}, public=${this.isPublic()})`,
    );
    return this.cachedClient;
  }
}
