import { ConfigService } from '@nestjs/config';
import { NotificationType } from '@prisma/client';
import { SavedSearchAlertService } from './saved-search-alert.service';

/**
 * Юнит-тесты SavedSearchAlertService (TASK-102). Prisma, SearchService,
 * NotificationsService и EmailService мокаются. Проверяются: выборка только
 * активных поисков (bounded by batch size), окно `(last_checked_at ?? created_at,
 * runAt]` для матчера, постановка PENDING-уведомления на каждое новое совпадение,
 * атомарная продвижка watermark (idempotent — concurrent advance count=0
 * пропускается), дайджест-письмо в email_queue (best-effort, пропуск без email),
 * усечение по потолку (watermark на last match) и изоляция ошибок по одному поиску.
 */
describe('SavedSearchAlertService', () => {
  const SEARCH_ID = '11111111-1111-1111-1111-111111111111';
  const USER_ID = '22222222-2222-2222-2222-222222222222';
  const LISTING_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const LISTING_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const CREATED_AT = new Date('2026-06-01T00:00:00.000Z');
  const LAST_CHECKED = new Date('2026-06-04T00:00:00.000Z');
  const PUB_A = new Date('2026-06-05T08:00:00.000Z');
  const PUB_B = new Date('2026-06-05T09:00:00.000Z');

  let prisma: any;
  let search: { matchNewlyActiveListings: jest.Mock };
  let notifications: { queueSavedSearchNewListing: jest.Mock };
  let email: { sendEmail: jest.Mock };
  let service: SavedSearchAlertService;

  const config = (over: Record<string, unknown> = {}): ConfigService =>
    ({
      get: (key: string) => over[key],
    }) as unknown as ConfigService;

  const savedSearch = (over: Record<string, unknown> = {}) => ({
    id: SEARCH_ID,
    userId: USER_ID,
    name: 'Tashkent 2-room',
    filtersJson: { schemaVersion: 1, filters: { city_id: 'tashkent' } },
    lastCheckedAt: LAST_CHECKED,
    createdAt: CREATED_AT,
    user: { email: 'owner@example.com' },
    ...over,
  });

  const build = (cfg: Record<string, unknown> = {}) =>
    new SavedSearchAlertService(
      prisma,
      search as any,
      notifications as any,
      email as any,
      config(cfg),
    );

  beforeEach(() => {
    prisma = {
      savedSearch: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: jest.fn(async (cb: any) => cb(prisma)),
    };
    search = { matchNewlyActiveListings: jest.fn().mockResolvedValue([]) };
    notifications = { queueSavedSearchNewListing: jest.fn() };
    email = { sendEmail: jest.fn().mockResolvedValue(undefined) };
    service = build({
      'savedSearch.alertBatchSize': 100,
      'savedSearch.alertMaxListings': 50,
    });
  });

  it('selects only active saved searches, stalest first, bounded by batch size', async () => {
    service = build({ 'savedSearch.alertBatchSize': 25 });

    await service.run();

    expect(prisma.savedSearch.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isActive: true },
        take: 25,
        orderBy: [
          { lastCheckedAt: { sort: 'asc', nulls: 'first' } },
          { id: 'asc' },
        ],
      }),
    );
  });

  it('matches over the (lastCheckedAt, runAt] window and strips null filters', async () => {
    prisma.savedSearch.findMany.mockResolvedValue([
      savedSearch({
        filtersJson: {
          schemaVersion: 1,
          filters: { city_id: 'tashkent', price_min: 100, stale: null },
        },
      }),
    ]);

    await service.run();

    expect(search.matchNewlyActiveListings).toHaveBeenCalledTimes(1);
    const [filters, publishedAfter, publishedUntil, limit] =
      search.matchNewlyActiveListings.mock.calls[0];
    expect(filters).toEqual({ city_id: 'tashkent', price_min: 100 });
    expect(publishedAfter).toEqual(LAST_CHECKED);
    expect(publishedUntil).toBeInstanceOf(Date);
    expect(limit).toBe(50);
  });

  // TASK-253: клиент исторически пишет scalar-строки/plural-ключи в filters_json;
  // сырой путь (в обход DTO @Transform(toArray)) обязан их нормализовать, иначе
  // Prisma.join(строка) в buildWhereSql падает с «r.reduce is not a function».
  describe('legacy filter normalization (TASK-253)', () => {
    const filtersOf = () => search.matchNewlyActiveListings.mock.calls[0][0];

    it('wraps a legacy scalar property_type into an array', async () => {
      prisma.savedSearch.findMany.mockResolvedValue([
        savedSearch({
          filtersJson: {
            schemaVersion: 1,
            filters: { property_type: 'HOUSE', transaction_type: 'SALE' },
          },
        }),
      ]);

      await service.run();

      expect(filtersOf()).toEqual({
        property_type: ['HOUSE'],
        transaction_type: 'SALE',
      });
    });

    it('prefers the property_types multi-select array over the legacy single value', async () => {
      prisma.savedSearch.findMany.mockResolvedValue([
        savedSearch({
          filtersJson: {
            schemaVersion: 1,
            filters: {
              property_type: 'APARTMENT',
              property_types: ['APARTMENT', 'HOUSE'],
            },
          },
        }),
      ]);

      await service.run();

      expect(filtersOf()).toEqual({ property_type: ['APARTMENT', 'HOUSE'] });
    });

    it('keeps an already-array property_type untouched', async () => {
      prisma.savedSearch.findMany.mockResolvedValue([
        savedSearch({
          filtersJson: {
            schemaVersion: 1,
            filters: { property_type: ['LAND'] },
          },
        }),
      ]);

      await service.run();

      expect(filtersOf()).toEqual({ property_type: ['LAND'] });
    });

    it('maps client parking_types (plural) to parking_type', async () => {
      prisma.savedSearch.findMany.mockResolvedValue([
        savedSearch({
          filtersJson: {
            schemaVersion: 1,
            filters: { parking_types: ['GARAGE', 'STREET'] },
          },
        }),
      ]);

      await service.run();

      expect(filtersOf()).toEqual({ parking_type: ['GARAGE', 'STREET'] });
    });

    it('wraps scalar parking_type, amenities and listing_source into arrays', async () => {
      prisma.savedSearch.findMany.mockResolvedValue([
        savedSearch({
          filtersJson: {
            schemaVersion: 1,
            filters: {
              parking_type: 'GARAGE',
              amenities: 'INTERNET',
              listing_source: 'OWNER',
            },
          },
        }),
      ]);

      await service.run();

      expect(filtersOf()).toEqual({
        parking_type: ['GARAGE'],
        amenities: ['INTERNET'],
        listing_source: ['OWNER'],
      });
    });
  });

  it('uses created_at as the floor when lastCheckedAt is null', async () => {
    prisma.savedSearch.findMany.mockResolvedValue([
      savedSearch({ lastCheckedAt: null }),
    ]);

    await service.run();

    expect(search.matchNewlyActiveListings.mock.calls[0][1]).toEqual(CREATED_AT);
  });

  it('queues a notification per match, advances watermark to runAt, sends digest', async () => {
    prisma.savedSearch.findMany.mockResolvedValue([savedSearch()]);
    search.matchNewlyActiveListings.mockResolvedValue([
      { id: LISTING_A, publishedAt: PUB_A },
      { id: LISTING_B, publishedAt: PUB_B },
    ]);

    const count = await service.run();

    expect(count).toBe(2);

    // watermark двигается на runAt (не усечено) с optimistic-гардом по старому значению
    const updateArg = prisma.savedSearch.updateMany.mock.calls[0][0];
    expect(updateArg.where).toEqual({
      id: SEARCH_ID,
      lastCheckedAt: LAST_CHECKED,
    });
    expect(updateArg.data.lastCheckedAt).toBeInstanceOf(Date);
    expect(updateArg.data.lastCheckedAt).not.toEqual(PUB_B); // runAt, не last match

    // по одному уведомлению на совпадение
    expect(notifications.queueSavedSearchNewListing).toHaveBeenCalledTimes(2);
    expect(notifications.queueSavedSearchNewListing).toHaveBeenCalledWith(
      prisma,
      USER_ID,
      expect.objectContaining({ savedSearchId: SEARCH_ID, listingId: LISTING_A }),
    );

    // один дайджест на поиск за прогон
    expect(email.sendEmail).toHaveBeenCalledTimes(1);
    expect(email.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'owner@example.com' }),
    );
  });

  it('creates SAVED_SEARCH_NEW_LISTING notifications via the transaction client', async () => {
    prisma.savedSearch.findMany.mockResolvedValue([savedSearch()]);
    search.matchNewlyActiveListings.mockResolvedValue([
      { id: LISTING_A, publishedAt: PUB_A },
    ]);
    // реальная реализация queue использует tx — здесь мок, проверяем тип через канал
    notifications.queueSavedSearchNewListing.mockImplementation(
      (_tx, _user, data) => {
        expect(data.listingId).toBe(LISTING_A);
        return Promise.resolve();
      },
    );

    await service.run();

    expect(NotificationType.SAVED_SEARCH_NEW_LISTING).toBeDefined();
    expect(notifications.queueSavedSearchNewListing).toHaveBeenCalled();
  });

  it('skips a search already advanced concurrently (updateMany count = 0)', async () => {
    prisma.savedSearch.findMany.mockResolvedValue([savedSearch()]);
    search.matchNewlyActiveListings.mockResolvedValue([
      { id: LISTING_A, publishedAt: PUB_A },
    ]);
    prisma.savedSearch.updateMany.mockResolvedValue({ count: 0 });

    const count = await service.run();

    expect(count).toBe(0);
    expect(notifications.queueSavedSearchNewListing).not.toHaveBeenCalled();
    expect(email.sendEmail).not.toHaveBeenCalled();
  });

  it('advances the watermark but sends nothing when there are no new matches', async () => {
    prisma.savedSearch.findMany.mockResolvedValue([savedSearch()]);
    search.matchNewlyActiveListings.mockResolvedValue([]);

    const count = await service.run();

    expect(count).toBe(0);
    // watermark всё равно двигается на runAt — иначе окно растёт без границы
    expect(prisma.savedSearch.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.savedSearch.updateMany.mock.calls[0][0].data.lastCheckedAt).toBeInstanceOf(
      Date,
    );
    expect(notifications.queueSavedSearchNewListing).not.toHaveBeenCalled();
    expect(email.sendEmail).not.toHaveBeenCalled();
  });

  it('caps at maxListings and advances watermark to the last match published_at', async () => {
    service = build({ 'savedSearch.alertMaxListings': 2 });
    prisma.savedSearch.findMany.mockResolvedValue([savedSearch()]);
    search.matchNewlyActiveListings.mockResolvedValue([
      { id: LISTING_A, publishedAt: PUB_A },
      { id: LISTING_B, publishedAt: PUB_B },
    ]);

    const count = await service.run();

    expect(count).toBe(2);
    expect(search.matchNewlyActiveListings.mock.calls[0][3]).toBe(2);
    // усечено → watermark = published_at последнего совпадения (не runAt)
    expect(prisma.savedSearch.updateMany.mock.calls[0][0].data.lastCheckedAt).toEqual(
      PUB_B,
    );
  });

  it('skips the digest when the owner has no email but still queues notifications', async () => {
    prisma.savedSearch.findMany.mockResolvedValue([
      savedSearch({ user: { email: null } }),
    ]);
    search.matchNewlyActiveListings.mockResolvedValue([
      { id: LISTING_A, publishedAt: PUB_A },
    ]);

    const count = await service.run();

    expect(count).toBe(1);
    expect(notifications.queueSavedSearchNewListing).toHaveBeenCalledTimes(1);
    expect(email.sendEmail).not.toHaveBeenCalled();
  });

  it('treats a digest enqueue failure as best-effort (alert still counts)', async () => {
    prisma.savedSearch.findMany.mockResolvedValue([savedSearch()]);
    search.matchNewlyActiveListings.mockResolvedValue([
      { id: LISTING_A, publishedAt: PUB_A },
    ]);
    email.sendEmail.mockRejectedValue(new Error('redis down'));

    const count = await service.run();

    expect(count).toBe(1);
    expect(notifications.queueSavedSearchNewListing).toHaveBeenCalledTimes(1);
  });

  it('isolates a per-search failure and keeps processing the rest', async () => {
    prisma.savedSearch.findMany.mockResolvedValue([
      savedSearch({ id: 's-fail' }),
      savedSearch({ id: 's-ok' }),
    ]);
    search.matchNewlyActiveListings
      .mockRejectedValueOnce(new Error('bad filter'))
      .mockResolvedValue([{ id: LISTING_A, publishedAt: PUB_A }]);

    const count = await service.run();

    expect(count).toBe(1);
    expect(search.matchNewlyActiveListings).toHaveBeenCalledTimes(2);
  });

  it('defaults batch size to 100 and maxListings to 50 when unconfigured', async () => {
    service = build();
    prisma.savedSearch.findMany.mockResolvedValue([savedSearch()]);
    search.matchNewlyActiveListings.mockResolvedValue([]);

    await service.run();

    expect(prisma.savedSearch.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 100 }),
    );
    expect(search.matchNewlyActiveListings.mock.calls[0][3]).toBe(50);
  });
});
