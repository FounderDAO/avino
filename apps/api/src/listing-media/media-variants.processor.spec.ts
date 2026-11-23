import { MediaType } from '@prisma/client';
import sharp from 'sharp';
import { PrismaService } from '../prisma';
import { UploadsService } from '../uploads';
import { variantKeysOf } from './listing-media.service';
import { MediaVariantsProcessor, renderVariants, variantKey } from './media-variants.processor';

async function jpeg(width: number, height: number, orientation?: number): Promise<Buffer> {
  let img = sharp({ create: { width, height, channels: 3, background: { r: 200, g: 60, b: 66 } } }).jpeg();
  if (orientation) img = img.withMetadata({ orientation });
  return img.toBuffer();
}

describe('media variants (SEO AUD-8)', () => {
  it('variantKey sits under /variants/ (media-cleanup scans only /media/)', () => {
    expect(variantKey('prod/listings/L/media/u.jpg', 640)).toBe('prod/listings/L/variants/u-640.webp');
  });

  it('renders WebP variants narrower than the original, keeping the aspect ratio', async () => {
    const out = await renderVariants(await jpeg(2000, 1500));
    expect(out).toMatchObject({ width: 2000, height: 1500 });
    expect(out.variants.map((v) => [v.width, v.height])).toEqual([
      [320, 240],
      [640, 480],
      [1280, 960],
    ]);
    const meta = await sharp(out.variants[1].buffer).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.exif).toBeUndefined();
  });

  it('a small original gives one variant at its own width', async () => {
    const out = await renderVariants(await jpeg(300, 200));
    expect(out.variants.map((v) => v.width)).toEqual([300]);
  });

  it('applies EXIF orientation (rotated photos keep portrait dimensions)', async () => {
    const out = await renderVariants(await jpeg(1600, 1200, 6));
    expect(out).toMatchObject({ width: 1200, height: 1600 });
    expect(out.variants[1]).toMatchObject({ width: 640, height: 853 });
  });

  it('processes a stored photo: uploads variants, saves size and points thumbnail to 640', async () => {
    const original = await jpeg(1600, 1200);
    const prisma = {
      listingMedia: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'm1', type: MediaType.IMAGE, url: 'u', storageKey: 'prod/listings/L/media/u.jpg', variants: null,
        }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const uploads = {
      extractKey: jest.fn(),
      download: jest.fn().mockResolvedValue(original),
      upload: jest.fn().mockResolvedValue({ key: 'k', url: 'u' }),
    };
    await new MediaVariantsProcessor(prisma as unknown as PrismaService, uploads as unknown as UploadsService).process('m1');
    expect(uploads.upload).toHaveBeenCalledTimes(3);
    expect(uploads.upload).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'prod/listings/L/variants/u-640.webp', contentType: 'image/webp' }),
    );
    const data = prisma.listingMedia.update.mock.calls[0][0].data;
    expect(data).toMatchObject({ width: 1600, height: 1200, thumbnailUrl: 'prod/listings/L/variants/u-640.webp' });
    expect(variantKeysOf(data.variants)).toHaveLength(3);
  });

  it('skips already processed media and non-images', async () => {
    const uploads = { download: jest.fn() };
    for (const row of [
      { id: 'm1', type: MediaType.IMAGE, url: 'u', storageKey: 'k', variants: [] },
      { id: 'm2', type: 'VIDEO', url: 'u', storageKey: 'k', variants: null },
      null,
    ]) {
      const prisma = { listingMedia: { findUnique: jest.fn().mockResolvedValue(row), update: jest.fn() } };
      await new MediaVariantsProcessor(prisma as unknown as PrismaService, uploads as unknown as UploadsService).process('x');
    }
    expect(uploads.download).not.toHaveBeenCalled();
  });
});
