import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { UploadsService } from './uploads.service';

/**
 * Юнит-тесты UploadsService (TASK-060). AWS SDK мокается — проверяется:
 * выбор публичного vs presigned URL по конфигу, ACL в публичном режиме,
 * генерация ключа, удаление и fail-fast при отсутствующей конфигурации
 * (никакого локального хранилища).
 */

// ── Моки AWS SDK ──────────────────────────────────────────────────────────
const send = jest.fn().mockResolvedValue({});

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation((config) => ({ config, send })),
  PutObjectCommand: jest.fn().mockImplementation((input) => ({
    __type: 'put',
    input,
  })),
  GetObjectCommand: jest.fn().mockImplementation((input) => ({
    __type: 'get',
    input,
  })),
  DeleteObjectCommand: jest.fn().mockImplementation((input) => ({
    __type: 'delete',
    input,
  })),
}));

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://signed.example/get'),
}));

// jest.mock хойстится выше импортов, поэтому здесь — уже мокнутые реализации.
const putObjectCommandMock = PutObjectCommand as unknown as jest.Mock;
const getSignedUrlMock = getSignedUrl as unknown as jest.Mock;

function makeService(overrides: Record<string, unknown> = {}): UploadsService {
  const values: Record<string, unknown> = {
    's3.endpoint': 'https://minio.local',
    's3.region': 'us-east-1',
    's3.bucket': 'avino-media',
    's3.accessKeyId': 'key',
    's3.secretAccessKey': 'secret',
    's3.forcePathStyle': true,
    's3.publicBaseUrl': undefined,
    's3.signedUrlTtl': 3600,
    ...overrides,
  };
  const configService = {
    get: (k: string) => values[k],
  } as any;
  return new UploadsService(configService);
}

describe('UploadsService', () => {
  beforeEach(() => {
    send.mockClear();
    putObjectCommandMock.mockClear();
    getSignedUrlMock.mockClear();
  });

  it('uploads a buffer and returns a presigned URL for a private bucket', async () => {
    const service = makeService();
    const buffer = Buffer.from('img');

    const result = await service.upload({
      buffer,
      contentType: 'image/jpeg',
      extension: '.jpg',
    });

    // PutObject отправлен с правильным bucket/body/contentType, без ACL.
    expect(send).toHaveBeenCalledTimes(1);
    const putInput = putObjectCommandMock.mock.calls[0][0];
    expect(putInput.Bucket).toBe('avino-media');
    expect(putInput.Body).toBe(buffer);
    expect(putInput.ContentType).toBe('image/jpeg');
    expect(putInput.ACL).toBeUndefined();
    expect(putInput.Key).toMatch(/^uploads\/[0-9a-f-]+\.jpg$/);

    // Приватный bucket → presigned URL.
    expect(getSignedUrlMock).toHaveBeenCalledTimes(1);
    expect(result.url).toBe('https://signed.example/get');
    expect(result.key).toBe(putInput.Key);
  });

  it('returns a direct public URL and sets public-read ACL when publicBaseUrl is set', async () => {
    const service = makeService({
      's3.publicBaseUrl': 'https://cdn.avino.uz/',
    });

    const result = await service.upload({
      buffer: Buffer.from('img'),
      contentType: 'image/png',
      key: 'listings/42/cover.png',
    });

    const putInput = putObjectCommandMock.mock.calls[0][0];
    expect(putInput.ACL).toBe('public-read');
    expect(putInput.Key).toBe('listings/42/cover.png');

    // Публичный режим → прямой URL без подписи, лишний слэш базы убран.
    expect(getSignedUrlMock).not.toHaveBeenCalled();
    expect(result.url).toBe('https://cdn.avino.uz/listings/42/cover.png');
  });

  it('respects an explicit key and prefix when generating keys', async () => {
    const service = makeService();

    const r1 = await service.upload({
      buffer: Buffer.from('a'),
      contentType: 'image/webp',
      prefix: 'avatars',
      extension: 'webp',
    });
    expect(r1.key).toMatch(/^avatars\/[0-9a-f-]+\.webp$/);
  });

  it('deletes an object via DeleteObjectCommand', async () => {
    const service = makeService();
    await service.delete('uploads/x.jpg');
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('throws (no local storage) when S3 credentials are missing', async () => {
    const service = makeService({
      's3.accessKeyId': undefined,
      's3.secretAccessKey': undefined,
    });
    await expect(
      service.upload({ buffer: Buffer.from('x'), contentType: 'image/jpeg' }),
    ).rejects.toThrow(/S3 storage is not configured/);
  });

  it('throws when the bucket is not configured', async () => {
    const service = makeService({ 's3.bucket': undefined });
    await expect(
      service.upload({ buffer: Buffer.from('x'), contentType: 'image/jpeg' }),
    ).rejects.toThrow(/S3_BUCKET is required/);
  });

  it('extracts a lowercased extension from a filename', () => {
    const service = makeService();
    expect(service.extensionFromFilename('PHOTO.JPG')).toBe('.jpg');
  });
});
