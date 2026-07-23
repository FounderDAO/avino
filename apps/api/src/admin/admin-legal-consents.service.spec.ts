import { AdminLegalConsentsService } from './admin-legal-consents.service';

/**
 * Юнит-тесты AdminLegalConsentsService. Prisma мокается — проверяются
 * фильтры (search/version/from/to), дефолты/кап пагинации, сортировка
 * `accepted_at DESC, id DESC` и snake_case-маппинг.
 */
describe('AdminLegalConsentsService', () => {
  let prisma: any;
  let service: AdminLegalConsentsService;

  beforeEach(() => {
    prisma = {
      legalConsent: {
        findMany: jest.fn(),
        count: jest.fn(),
        groupBy: jest.fn(),
      },
      auditLog: { findMany: jest.fn() },
    };
    service = new AdminLegalConsentsService(prisma);
  });

  const row = {
    id: 'c1',
    userId: 'u1',
    version: 2,
    acceptedAt: new Date('2026-07-21T10:00:00Z'),
    user: {
      phone: '+998901234567',
      email: 'a@b.uz',
      profile: { displayName: 'Tommy' },
    },
  };

  it('snake_case-маппинг: контакт = phone, дефолт-пагинация', async () => {
    prisma.legalConsent.findMany.mockResolvedValue([row]);
    prisma.legalConsent.count.mockResolvedValue(1);

    const res = await service.listConsents({});

    expect(res.data[0]).toEqual({
      id: 'c1',
      user_id: 'u1',
      user_name: 'Tommy',
      user_contact: '+998901234567',
      version: 2,
      accepted_at: '2026-07-21T10:00:00.000Z',
    });
    expect(res.meta).toEqual({ page: 1, limit: 20, total: 1 });
  });

  it('контакт = email при отсутствии phone; null-профиль → null-имя', async () => {
    prisma.legalConsent.findMany.mockResolvedValue([
      {
        ...row,
        id: 'c2',
        user: { phone: null, email: 'x@y.uz', profile: null },
      },
    ]);
    prisma.legalConsent.count.mockResolvedValue(1);

    const res = await service.listConsents({});

    expect(res.data[0].user_contact).toBe('x@y.uz');
    expect(res.data[0].user_name).toBeNull();
  });

  it('фильтры search/version/from/to, пагинация и сортировка', async () => {
    prisma.legalConsent.findMany.mockResolvedValue([]);
    prisma.legalConsent.count.mockResolvedValue(0);

    await service.listConsents({
      search: 'tom',
      version: 3,
      from: '2026-07-01T00:00:00.000Z',
      to: '2026-07-31T23:59:59.999Z',
      page: 2,
      limit: 50,
    });

    const args = prisma.legalConsent.findMany.mock.calls[0][0];
    expect(args.where.version).toBe(3);
    expect(args.where.acceptedAt).toEqual({
      gte: new Date('2026-07-01T00:00:00.000Z'),
      lte: new Date('2026-07-31T23:59:59.999Z'),
    });
    expect(args.where.user.OR).toEqual([
      { phone: { contains: 'tom', mode: 'insensitive' } },
      { email: { contains: 'tom', mode: 'insensitive' } },
      { profile: { firstName: { contains: 'tom', mode: 'insensitive' } } },
      { profile: { lastName: { contains: 'tom', mode: 'insensitive' } } },
      { profile: { displayName: { contains: 'tom', mode: 'insensitive' } } },
    ]);
    expect(args.skip).toBe(50);
    expect(args.take).toBe(50);
    expect(args.orderBy).toEqual([{ acceptedAt: 'desc' }, { id: 'desc' }]);
  });
});
