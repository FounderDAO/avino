import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AmenitiesService, slugifyCode } from './amenities.service';

const row = (over: Partial<any> = {}) => ({
  id: 'id1', code: 'INTERNET', labelRu: 'Интернет', labelUz: 'Internet',
  labelEn: 'Internet', isActive: true, sortOrder: 3, ...over,
});

function makePrisma(over: Record<string, any> = {}) {
  return {
    amenity: {
      findMany: jest.fn().mockResolvedValue([row()]),
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue(row()),
      create: jest.fn().mockResolvedValue(row({ id: 'new', code: 'VIDEO_SURVEILLANCE' })),
      update: jest.fn().mockResolvedValue(row({ isActive: false })),
      ...over,
    },
  } as any;
}

describe('slugifyCode', () => {
  it('делает UPPER_SNAKE из EN-лейбла', () => {
    expect(slugifyCode('Video surveillance')).toBe('VIDEO_SURVEILLANCE');
    expect(slugifyCode('  Wi-Fi 5G!  ')).toBe('WI_FI_5G');
  });
});

describe('AmenitiesService', () => {
  it('listActive отдаёт snake_case и фильтрует по is_active', async () => {
    const prisma = makePrisma();
    const svc = new AmenitiesService(prisma);
    const res = await svc.listActive();
    expect(prisma.amenity.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isActive: true } }),
    );
    expect(res[0]).toMatchObject({ code: 'INTERNET', label_ru: 'Интернет', is_active: true, sort_order: 3 });
  });

  it('create генерит slug из label_en когда code не задан', async () => {
    const prisma = makePrisma();
    const svc = new AmenitiesService(prisma);
    await svc.create({ label_ru: 'Видео', label_uz: 'Video', label_en: 'Video surveillance' } as any);
    expect(prisma.amenity.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ code: 'VIDEO_SURVEILLANCE' }) }),
    );
  });

  it('create кидает Conflict при дубле code', async () => {
    const prisma = makePrisma({ findFirst: jest.fn().mockResolvedValue(row()) });
    const svc = new AmenitiesService(prisma);
    await expect(
      svc.create({ label_ru: 'a', label_uz: 'b', label_en: 'Internet' } as any),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('create мапит P2002 из prisma.amenity.create в Conflict (гонка TOCTOU)', async () => {
    const prisma = makePrisma({
      create: jest.fn().mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      ),
    });
    const svc = new AmenitiesService(prisma);
    await expect(
      svc.create({ label_ru: 'a', label_uz: 'b', label_en: 'Internet' } as any),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
