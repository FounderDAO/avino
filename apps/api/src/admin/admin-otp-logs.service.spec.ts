import { OtpChannel, OtpPurpose } from '@prisma/client';
import { AdminOtpLogsService } from './admin-otp-logs.service';

/**
 * Юнит-тесты AdminOtpLogsService. Prisma мокается — проверяются substring-фильтр
 * по destination, дефолты/кап пагинации, сортировка `created_at DESC, id DESC`,
 * snake_case-маппинг и вычисление статуса (ACTIVE/CONSUMED/EXPIRED).
 */
describe('AdminOtpLogsService', () => {
  let prisma: any;
  let service: AdminOtpLogsService;

  beforeEach(() => {
    prisma = { otpCode: { findMany: jest.fn(), count: jest.fn() } };
    service = new AdminOtpLogsService(prisma);
  });

  const base = {
    id: 'o1',
    destination: '+998901234567',
    channel: OtpChannel.SMS,
    purpose: OtpPurpose.LOGIN,
    attempts: 2,
    expiresAt: new Date(Date.now() + 300_000),
    consumedAt: null as Date | null,
    createdAt: new Date('2026-07-21T10:00:00Z'),
    userId: 'u1' as string | null,
    user: { profile: { displayName: 'Tommy' } } as {
      profile: { displayName: string | null } | null;
    } | null,
  };

  it('snake_case-маппинг и статус ACTIVE для живого кода', async () => {
    prisma.otpCode.findMany.mockResolvedValue([base]);
    prisma.otpCode.count.mockResolvedValue(1);

    const res = await service.listOtpLogs({});

    expect(res.data[0]).toEqual({
      id: 'o1',
      destination: '+998901234567',
      channel: OtpChannel.SMS,
      purpose: OtpPurpose.LOGIN,
      attempts: 2,
      status: 'ACTIVE',
      user_id: 'u1',
      user_name: 'Tommy',
      created_at: '2026-07-21T10:00:00.000Z',
      expires_at: base.expiresAt.toISOString(),
      consumed_at: null,
    });
    expect(res.meta).toEqual({ page: 1, limit: 20, total: 1 });
  });

  it('CONSUMED при consumed_at, EXPIRED при истёкшем сроке, null-user → null-имя', async () => {
    const consumed = {
      ...base,
      id: 'o2',
      consumedAt: new Date('2026-07-21T10:01:00Z'),
    };
    const expired = {
      ...base,
      id: 'o3',
      expiresAt: new Date(Date.now() - 1000),
      userId: null,
      user: null,
    };
    prisma.otpCode.findMany.mockResolvedValue([consumed, expired]);
    prisma.otpCode.count.mockResolvedValue(2);

    const res = await service.listOtpLogs({});

    expect(res.data.map((r) => r.status)).toEqual(['CONSUMED', 'EXPIRED']);
    expect(res.data[0].consumed_at).toBe('2026-07-21T10:01:00.000Z');
    expect(res.data[1].user_id).toBeNull();
    expect(res.data[1].user_name).toBeNull();
  });

  it('substring-фильтр по destination, пагинация и сортировка', async () => {
    prisma.otpCode.findMany.mockResolvedValue([]);
    prisma.otpCode.count.mockResolvedValue(0);

    await service.listOtpLogs({ destination: '99890', page: 2, limit: 50 });

    const args = prisma.otpCode.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ destination: { contains: '99890' } });
    expect(args.skip).toBe(50);
    expect(args.take).toBe(50);
    expect(args.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
  });
});
