import { HttpException } from '@nestjs/common';
import { ListingStatus, UserStatus } from '@prisma/client';
import { Workbook } from 'exceljs';
import { AddressResolverService, DistrictsService } from '../geo';
import { ListingsService } from '../listings/listings.service';
import { PrismaService } from '../prisma';
import { ActiveListingLimitService } from '../settings';
import { TranslationsService } from '../translations';
import { UploadsService } from '../uploads';
import { ImportUploadedFile } from './import-file.parser';
import { ListingImportLock } from './listing-import.lock';
import { ListingImportService } from './listing-import.service';

// Лимит активных объявлений = 1: импорт обязан его игнорировать.
const activeLimitStub = { getLimit: async () => 1 } as unknown as ActiveListingLimitService;
// Геокодер не должен вызываться при импорте вообще.
const addressResolverStub = {
  resolve: async () => {
    throw new Error('geocoder must not be called by import');
  },
} as unknown as AddressResolverService;

/** Блокировка в памяти — int-spec не зависит от Redis. */
class MemoryLock {
  held = false;
  async acquire(): Promise<string | null> {
    if (this.held) return null;
    this.held = true;
    return 'token';
  }
  async release(): Promise<void> {
    this.held = false;
  }
}

const HEADERS = [
  'Телефон', 'Имя', 'Фамилия', 'Тип сделки', 'Тип недвижимости', 'Заголовок',
  'Цена', 'Валюта', 'Адрес', 'Площадь', 'Этаж', 'Год постройки', 'Фото',
];

const PHONE_NEW = '+998905550001';
const PHONE_EXISTING = '+998905550002';
const PHONE_BLOCKED = '+998905550003';
const PHONE_NO_NAME = '+998905550004';
const PHONE_ANCHOR = '+998905550005';
const PHONE_PHOTOS = '+998905550006';
const PHONE_ADMIN = '+998905550009';
const PHONES = [PHONE_NEW, PHONE_EXISTING, PHONE_BLOCKED, PHONE_NO_NAME, PHONE_ANCHOR, PHONE_PHOTOS, PHONE_ADMIN];

// Адрес намеренно такой, который normalizeAddress меняет («улица» → «ул.», срез страны).
const ADDRESS = 'Узбекистан, Ташкент, улица Импортная, 7';

function row(phone: string | number, overrides: Partial<Record<string, string | number>> = {}): (string | number)[] {
  const values: Record<string, string | number> = {
    Телефон: phone,
    Имя: 'Али',
    Фамилия: 'Валиев',
    'Тип сделки': 'Продажа',
    'Тип недвижимости': 'Квартира',
    Заголовок: 'Импорт-тест',
    Цена: 85000,
    Валюта: 'USD',
    Адрес: ADDRESS,
    Площадь: 55,
    Этаж: 3,
    'Год постройки': 2015,
    ...overrides,
  };
  return HEADERS.map((header) => values[header] ?? '');
}

async function file(rows: (string | number)[][]): Promise<ImportUploadedFile> {
  const workbook = new Workbook();
  const sheet = workbook.addWorksheet('Импорт');
  sheet.addRow(HEADERS);
  rows.forEach((r) => sheet.addRow(r));
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  return { buffer, originalname: 'import.xlsx', size: buffer.length };
}

describe('ListingImportService (integration)', () => {
  const prisma = new PrismaService();
  const listings = new ListingsService(
    prisma,
    new TranslationsService(prisma),
    new DistrictsService(prisma),
    {} as UploadsService,
    activeLimitStub,
    addressResolverStub,
  );
  const lock = new MemoryLock();
  const photoQueue = { enqueue: jest.fn().mockResolvedValue(undefined) };
  const service = new ListingImportService(prisma, listings, lock as unknown as ListingImportLock, photoQueue as any);

  beforeEach(() => photoQueue.enqueue.mockClear());

  let adminId: string;
  let existingId: string;

  async function cleanup(): Promise<void> {
    const users = await prisma.user.findMany({
      where: { phone: { in: PHONES } },
      select: { id: true },
    });
    const ids = users.map((u) => u.id);
    await prisma.listingImport.deleteMany({ where: { createdById: { in: ids } } });
    await prisma.listing.deleteMany({ where: { ownerId: { in: ids } } });
    await prisma.auditLog.deleteMany({ where: { actorId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }

  const ownerListings = (phone: string) =>
    prisma.listing.findMany({
      where: { owner: { phone } },
      include: { translations: true, priceHistory: true },
      orderBy: { createdAt: 'asc' },
    });

  beforeAll(async () => {
    await prisma.$connect();
    await cleanup();
    for (const code of ['USER', 'OWNER']) {
      await prisma.role.upsert({ where: { code }, create: { code }, update: {} });
    }
    adminId = (await prisma.user.create({ data: { phone: PHONE_ADMIN } })).id;
    existingId = (
      await prisma.user.create({
        data: {
          phone: PHONE_EXISTING,
          profile: { create: { firstName: 'Старое', lastName: 'Имя' } },
        },
      })
    ).id;
    await prisma.user.create({ data: { phone: PHONE_BLOCKED, status: UserStatus.BLOCKED } });
    await prisma.user.create({ data: { phone: PHONE_NO_NAME } });
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it('dry_run ничего не пишет и помечает нового владельца', async () => {
    const before = await Promise.all([
      prisma.user.count(),
      prisma.listing.count(),
      prisma.listingImport.count(),
    ]);
    const report = await service.run(await file([row('90 555 00 01')]), adminId, true);
    expect(report.id).toBeNull();
    expect(report.dry_run).toBe(true);
    expect(report.rows[0]).toMatchObject({
      row: 2,
      outcome: 'TO_CREATE',
      owner_is_new: true,
      phone: '+998905550001',
    });
    expect(report.summary).toMatchObject({ total: 1, to_create: 1, created: 0 });
    expect(
      await Promise.all([prisma.user.count(), prisma.listing.count(), prisma.listingImport.count()]),
    ).toEqual(before);
  });

  it('новый владелец: user + USER/OWNER + профиль + NEW-объявление + перевод + история цены', async () => {
    const report = await service.run(await file([row(905550001)]), adminId, false);
    expect(report.id).toEqual(expect.any(String));
    expect(report.rows[0]).toMatchObject({ outcome: 'CREATED', owner_is_new: true });
    expect(report.rows[0].listing_reference).toEqual(expect.any(Number));

    const owner = await prisma.user.findFirstOrThrow({
      where: { phone: PHONE_NEW },
      include: { profile: true, roles: { include: { role: true } } },
    });
    expect(owner.isPhoneVerified).toBe(false);
    expect(owner.profile).toMatchObject({ firstName: 'Али', lastName: 'Валиев' });
    expect(owner.roles.map((r) => r.role.code).sort()).toEqual(['OWNER', 'USER']);

    const [listing] = await ownerListings(PHONE_NEW);
    expect(listing.status).toBe(ListingStatus.NEW);
    expect(listing.address).not.toContain('Узбекистан');
    expect(listing.latitude).toBeNull();
    expect(listing.translations).toHaveLength(1);
    expect(listing.translations[0].title).toBe('Импорт-тест');
    expect(listing.priceHistory).toHaveLength(1);

    const saved = await prisma.listingImport.findUniqueOrThrow({
      where: { id: report.id as string },
      include: { rows: true },
    });
    expect(saved).toMatchObject({ createdById: adminId, totalRows: 1, createdCount: 1 });
    expect(saved.rows[0]).toMatchObject({
      rowNumber: 2,
      outcome: 'CREATED',
      listingId: listing.id,
      ownerIsNew: true,
    });
    const audits = await prisma.auditLog.findMany({
      where: { action: 'LISTING_IMPORT', entityId: report.id as string },
    });
    expect(audits).toHaveLength(1);
    expect(audits[0].metadata).toMatchObject({ total_rows: 1 });
  });

  it('повторный запуск того же файла: 0 создано, строка — «уже существует»', async () => {
    const report = await service.run(await file([row(PHONE_NEW)]), adminId, false);
    expect(report.summary).toMatchObject({ created: 0, skipped_exists: 1 });
    const [listing] = await ownerListings(PHONE_NEW);
    expect(report.rows[0]).toMatchObject({
      outcome: 'SKIPPED_EXISTS',
      listing_id: listing.id,
      listing_reference: listing.reference,
    });
    expect(await ownerListings(PHONE_NEW)).toHaveLength(1);
  });

  it('другая цена и регистр адреса — всё равно пропуск; другой этаж — создаётся', async () => {
    const report = await service.run(
      await file([
        row(PHONE_NEW, { Цена: 1, Адрес: '  ТАШКЕНТ,  ул. импортная, 7 ', Площадь: '55,00' }),
        row(PHONE_NEW, { Этаж: 4 }),
      ]),
      adminId,
      false,
    );
    expect(report.rows.map((r) => r.outcome)).toEqual(['SKIPPED_EXISTS', 'CREATED']);
    expect(report.rows[1].owner_is_new).toBe(false);
  });

  it('удалённое объявление не считается существующим', async () => {
    await prisma.listing.updateMany({
      where: { owner: { phone: PHONE_NEW }, floor: 4 },
      data: { status: ListingStatus.DELETED },
    });
    const report = await service.run(await file([row(PHONE_NEW, { Этаж: 4 })]), adminId, false);
    expect(report.rows[0].outcome).toBe('CREATED');
  });

  it('существующий владелец: профиль не меняется, лимит активных не мешает', async () => {
    const report = await service.run(
      await file([
        row(PHONE_EXISTING, { Имя: 'Новое', Адрес: 'Ташкент, Лимитная, 1' }),
        row(PHONE_EXISTING, { Имя: 'Новое', Адрес: 'Ташкент, Лимитная, 2' }),
      ]),
      adminId,
      false,
    );
    expect(report.rows.map((r) => r.outcome)).toEqual(['CREATED', 'CREATED']);
    const profile = await prisma.userProfile.findUniqueOrThrow({ where: { userId: existingId } });
    expect(profile).toMatchObject({ firstName: 'Старое', lastName: 'Имя' });
  });

  it('пустой профиль дозаполняется из файла; без имени — ошибка', async () => {
    const failed = await service.run(
      await file([row(PHONE_NO_NAME, { Имя: '', Фамилия: '' })]),
      adminId,
      false,
    );
    expect(failed.rows[0]).toMatchObject({
      outcome: 'ERROR',
      errors: [{ column: 'first_name', code: 'OWNER_NAME_REQUIRED' }],
    });
    const done = await service.run(await file([row(PHONE_NO_NAME)]), adminId, false);
    expect(done.rows[0].outcome).toBe('CREATED');
    const owner = await prisma.user.findFirstOrThrow({
      where: { phone: PHONE_NO_NAME },
      include: { profile: true },
    });
    expect(owner.profile).toMatchObject({ firstName: 'Али', lastName: 'Валиев' });
  });

  it('заблокированный владелец и ошибка валидации не мешают остальным строкам', async () => {
    const report = await service.run(
      await file([
        row(PHONE_BLOCKED),
        row(PHONE_EXISTING, { Цена: 'дорого', Адрес: 'Ташкент, Ошибочная, 1' }),
        row(PHONE_EXISTING, { Адрес: 'Ташкент, Хорошая, 1' }),
      ]),
      adminId,
      false,
    );
    expect(report.rows.map((r) => r.outcome)).toEqual(['ERROR', 'ERROR', 'CREATED']);
    expect(report.rows[0].errors).toMatchObject([{ column: 'phone', code: 'OWNER_BLOCKED' }]);
    expect(report.rows[1].errors).toMatchObject([{ column: 'price', code: 'INVALID_VALUE' }]);
    expect(report.summary).toMatchObject({ total: 3, created: 1, errors: 2 });
  });

  it('повтор в файле и две строки одного НОВОГО телефона', async () => {
    await cleanupOwner(PHONE_NEW);
    const report = await service.run(
      await file([
        row(PHONE_NEW, { Адрес: 'Ташкент, Первая, 1' }),
        row(PHONE_NEW, { Адрес: 'Ташкент, Вторая, 2' }),
        row(PHONE_NEW, { Адрес: 'ташкент,  первая, 1', Цена: 5 }),
      ]),
      adminId,
      false,
    );
    expect(report.rows.map((r) => r.outcome)).toEqual([
      'CREATED',
      'CREATED',
      'SKIPPED_DUPLICATE_IN_FILE',
    ]);
    expect(report.rows[0].owner_is_new).toBe(true);
    expect(report.rows[1].owner_is_new).toBe(false);
    expect(report.rows[2].duplicate_of_row).toBe(2);
    expect(await prisma.user.count({ where: { phone: PHONE_NEW } })).toBe(1);
  });

  it('повтор в файле не ссылается на строку, закончившуюся ошибкой', async () => {
    // Ключ повтора не включает имя: первая строка (новый владелец без имени) — ERROR,
    // вторая с именем создаётся, третья — повтор второй.
    const address = { Адрес: 'Ташкент, Якорная, 1' };
    const report = await service.run(
      await file([
        row(PHONE_ANCHOR, { ...address, Имя: '', Фамилия: '' }),
        row(PHONE_ANCHOR, address),
        row(PHONE_ANCHOR, address),
      ]),
      adminId,
      false,
    );
    expect(report.rows.map((r) => r.outcome)).toEqual([
      'ERROR',
      'CREATED',
      'SKIPPED_DUPLICATE_IN_FILE',
    ]);
    expect(report.rows[0].errors).toMatchObject([{ code: 'OWNER_NAME_REQUIRED' }]);
    expect(report.rows[2].duplicate_of_row).toBe(report.rows[1].row);
  });

  it('getReport возвращает сохранённый отчёт', async () => {
    const run = await service.run(
      await file([row(PHONE_EXISTING, { Адрес: 'Ташкент, Отчётная, 1' })]),
      adminId,
      false,
    );
    const report = await service.getReport(run.id as string);
    expect(report).toEqual({ ...run, dry_run: false, incomplete: false });
    await expect(service.getReport('00000000-0000-4000-8000-000000000000')).rejects.toMatchObject({
      status: 404,
    });
  });

  it('getReport помечает отчёт прерванного импорта как incomplete', async () => {
    const run = await service.run(
      await file([row(PHONE_EXISTING, { Адрес: 'Ташкент, Прерванная, 1' })]),
      adminId,
      false,
    );
    expect(run.incomplete).toBe(false);
    await prisma.listingImportRow.deleteMany({ where: { importId: run.id as string } });
    expect((await service.getReport(run.id as string)).incomplete).toBe(true);
  });

  it('второй импорт во время первого → 409 IMPORT_IN_PROGRESS', async () => {
    lock.held = true;
    try {
      await service.run(await file([row(PHONE_EXISTING)]), adminId, false);
      throw new Error('expected rejection');
    } catch (error) {
      expect((error as HttpException).getStatus()).toBe(409);
      expect(((error as HttpException).getResponse() as { code: string }).code).toBe(
        'IMPORT_IN_PROGRESS',
      );
    } finally {
      lock.held = false;
    }
  });

  describe('фото', () => {
    const photoRows = (importId: string) =>
      prisma.listingImportPhoto.findMany({ where: { importId }, orderBy: [{ rowNumber: 'asc' }, { position: 'asc' }] });

    it('dry_run: фото в отчёте без id, сводка по ссылкам и файлам, в БД ничего', async () => {
      const before = await prisma.listingImportPhoto.count();
      const report = await service.run(
        await file([row(PHONE_PHOTOS, { Адрес: 'Ташкент, Фото, 1', Фото: 'https://a.uz/1.jpg, 2.jpg' })]),
        adminId,
        true,
      );
      expect(report.rows[0]).toMatchObject({
        outcome: 'TO_CREATE',
        photos_attached: true,
        photos: [
          { id: null, position: 0, source: 'URL', ref: 'https://a.uz/1.jpg', status: null },
          { id: null, position: 1, source: 'FILE', ref: '2.jpg', status: null },
        ],
      });
      expect(report.photos_summary).toEqual({ total: 2, done: 0, failed: 0, pending: 1, awaiting_upload: 1 });
      expect(await prisma.listingImportPhoto.count()).toBe(before);
    });

    it('CREATED: записи PENDING/AWAITING_UPLOAD, в очередь — только ссылки', async () => {
      const report = await service.run(
        await file([row(PHONE_PHOTOS, { Адрес: 'Ташкент, Фото, 1', Фото: 'https://a.uz/1.jpg, 2.jpg' })]),
        adminId,
        false,
      );
      expect(report.rows[0]).toMatchObject({ outcome: 'CREATED', photos_attached: true });
      const records = await photoRows(report.id as string);
      expect(records.map((r) => [r.position, r.source, r.status, r.listingId])).toEqual([
        [0, 'URL', 'PENDING', report.rows[0].listing_id],
        [1, 'FILE', 'AWAITING_UPLOAD', report.rows[0].listing_id],
      ]);
      expect(photoQueue.enqueue).toHaveBeenCalledWith([records[0].id]);
      expect(report.rows[0].photos?.map((p) => p.id)).toEqual(records.map((r) => r.id));
      expect(report.photos_summary).toEqual({ total: 2, done: 0, failed: 0, pending: 1, awaiting_upload: 1 });
    });

    it('SKIPPED_EXISTS: незавершённые фото другого импорта → не прикрепляем', async () => {
      const report = await service.run(
        await file([row(PHONE_PHOTOS, { Адрес: 'Ташкент, Фото, 1', Фото: '3.jpg' })]),
        adminId,
        false,
      );
      expect(report.rows[0]).toMatchObject({
        outcome: 'SKIPPED_EXISTS',
        photos_attached: false,
        photos: [{ id: null, ref: '3.jpg', status: null }],
      });
      expect(await photoRows(report.id as string)).toHaveLength(0);
    });

    it('SKIPPED_EXISTS без фото → прикрепляем; повторный запуск — без дублей; ровно одна строка отчёта на строку файла', async () => {
      // Объявление без фото: создано первой фазой (без колонки «Фото»).
      await service.run(await file([row(PHONE_PHOTOS, { Адрес: 'Ташкент, Фото, 2' })]), adminId, false);
      const mixed = await service.run(
        await file([
          row(PHONE_PHOTOS, { Адрес: 'Ташкент, Фото, 2', Фото: 'https://a.uz/x.jpg' }),
          row(PHONE_PHOTOS, { Адрес: 'Ташкент, Фото, 3', Фото: 'y.jpg' }),
          row(PHONE_PHOTOS, { Цена: 'дорого', Адрес: 'Ташкент, Фото, 4', Фото: 'z.jpg' }),
        ]),
        adminId,
        false,
      );
      expect(mixed.rows.map((r) => [r.outcome, r.photos_attached])).toEqual([
        ['SKIPPED_EXISTS', true],
        ['CREATED', true],
        ['ERROR', undefined],
      ]);
      const rows = await prisma.listingImportRow.findMany({ where: { importId: mixed.id as string } });
      expect(rows).toHaveLength(3);
      expect(rows.find((r) => r.rowNumber === 2)?.photosAttached).toBe(true);

      const again = await service.run(
        await file([row(PHONE_PHOTOS, { Адрес: 'Ташкент, Фото, 2', Фото: 'https://a.uz/x.jpg' })]),
        adminId,
        false,
      );
      expect(again.rows[0]).toMatchObject({ outcome: 'SKIPPED_EXISTS', photos_attached: false });
      expect(await photoRows(again.id as string)).toHaveLength(0);
    });

    it('getReport совпадает с ответом запуска, включая фото', async () => {
      const run = await service.run(
        await file([row(PHONE_PHOTOS, { Адрес: 'Ташкент, Фото, 5', Фото: '5.jpg' })]),
        adminId,
        false,
      );
      expect(await service.getReport(run.id as string)).toEqual(run);
    });
  });

  async function cleanupOwner(phone: string): Promise<void> {
    const users = await prisma.user.findMany({ where: { phone }, select: { id: true } });
    const ids = users.map((u) => u.id);
    await prisma.listing.deleteMany({ where: { ownerId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }
});
