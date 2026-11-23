import { Injectable, Logger } from '@nestjs/common';
import { MediaType, Prisma } from '@prisma/client';
import sharp from 'sharp';
import { PrismaService } from '../prisma';
import { UploadsService } from '../uploads';

/** Ширины вариантов (SEO AUD-8): карточка, превью/карусель, галерея. */
export const VARIANT_WIDTHS = [320, 640, 1280] as const;
/** Вариант для thumbnail_url (карточки поиска): раньше там был оригинал до ~2,9 МБ. */
export const THUMBNAIL_WIDTH = 640;

export interface MediaVariant {
  key: string;
  width: number;
  height: number;
  format: 'webp';
}

/**
 * Ключ варианта рядом с оригиналом, но под `/variants/`: media-cleanup сканирует
 * только `/media/` и не примет варианты за «сирот».
 * `prod/listings/L/media/u.jpg` → `prod/listings/L/variants/u-640.webp`.
 */
export function variantKey(originalKey: string, width: number): string {
  const base = originalKey.replace('/media/', '/variants/').replace(/\.[^/.]+$/, '');
  return `${base}-${width}.webp`;
}

export interface RenderedVariant {
  width: number;
  height: number;
  buffer: Buffer;
}

/**
 * WebP-варианты фото: ориентация по EXIF применяется, метаданные (EXIF, GPS)
 * не переносятся. Только ширины меньше оригинала; маленький оригинал — один
 * вариант его ширины.
 */
export async function renderVariants(original: Buffer): Promise<{ width: number; height: number; variants: RenderedVariant[] }> {
  const meta = await sharp(original, { failOn: 'none' }).metadata();
  const rotated = (meta.orientation ?? 1) >= 5;
  const width = (rotated ? meta.height : meta.width) ?? 0;
  const height = (rotated ? meta.width : meta.height) ?? 0;
  if (!width || !height) {
    throw new Error('Unreadable image dimensions');
  }
  const widths = VARIANT_WIDTHS.filter((w) => w < width);
  const targets = widths.length > 0 ? widths : [width];
  const variants: RenderedVariant[] = [];
  for (const target of targets) {
    const { data, info } = await sharp(original, { failOn: 'none' })
      .rotate()
      .resize({ width: target, withoutEnlargement: true })
      .webp({ quality: 78 })
      .toBuffer({ resolveWithObject: true });
    variants.push({ width: info.width, height: info.height, buffer: data });
  }
  return { width, height, variants };
}

/**
 * Обработка загруженного фото (SEO AUD-8): WebP-варианты в хранилище, размеры
 * оригинала, thumbnail_url → вариант 640. Идемпотентно: уже обработанное фото
 * пропускается. Ошибка бросается — BullMQ повторит.
 */
@Injectable()
export class MediaVariantsProcessor {
  private readonly logger = new Logger(MediaVariantsProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly uploads: UploadsService,
  ) {}

  async process(mediaId: string): Promise<void> {
    const media = await this.prisma.listingMedia.findUnique({
      where: { id: mediaId },
      select: { id: true, type: true, url: true, storageKey: true, variants: true },
    });
    if (!media || media.type !== MediaType.IMAGE || media.variants !== null) {
      return;
    }
    const key = media.storageKey ?? this.uploads.extractKey(media.url);
    const rendered = await renderVariants(await this.uploads.download(key));

    const variants: MediaVariant[] = [];
    for (const v of rendered.variants) {
      const vKey = variantKey(key, v.width);
      await this.uploads.upload({ buffer: v.buffer, contentType: 'image/webp', key: vKey });
      variants.push({ key: vKey, width: v.width, height: v.height, format: 'webp' });
    }
    const thumbnail = variants.find((v) => v.width === THUMBNAIL_WIDTH) ?? variants[variants.length - 1];

    await this.prisma.listingMedia.update({
      where: { id: media.id },
      data: {
        width: rendered.width,
        height: rendered.height,
        variants: variants as unknown as Prisma.InputJsonValue,
        thumbnailUrl: thumbnail.key,
      },
    });
    this.logger.log(`Media ${media.id}: ${variants.map((v) => v.width).join('/')} px variants`);
  }
}
