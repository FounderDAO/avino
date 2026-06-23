import { BroadcastAudience, Language, UserStatus } from '@prisma/client';
import { BroadcastAudienceService } from './broadcast-audience.service';

function makePrisma() {
  return { user: { count: jest.fn().mockResolvedValue(0) } };
}

describe('BroadcastAudienceService.buildUserWhere', () => {
  it('SEGMENT: filters by language + default status ACTIVE', () => {
    const svc = new BroadcastAudienceService(makePrisma() as never);
    const where = svc.buildUserWhere({
      audienceType: BroadcastAudience.SEGMENT,
      language: Language.RU,
    });
    expect(where).toEqual({ status: UserStatus.ACTIVE, defaultLanguage: Language.RU });
  });

  it('SEGMENT: applies role filter via roles relation', () => {
    const svc = new BroadcastAudienceService(makePrisma() as never);
    const where = svc.buildUserWhere({
      audienceType: BroadcastAudience.SEGMENT,
      language: Language.UZ,
      filterRole: 'USER',
    });
    expect(where.roles).toEqual({ some: { role: { code: 'USER' } } });
  });

  it('SINGLE: targets a single user id', () => {
    const svc = new BroadcastAudienceService(makePrisma() as never);
    const where = svc.buildUserWhere({
      audienceType: BroadcastAudience.SINGLE,
      language: Language.RU,
      targetUserId: 'u-1',
    });
    expect(where).toEqual({ id: 'u-1' });
  });

  it('SINGLE without targetUserId throws (no invalid-uuid placeholder)', () => {
    const svc = new BroadcastAudienceService(makePrisma() as never);
    expect(() =>
      svc.buildUserWhere({
        audienceType: BroadcastAudience.SINGLE,
        language: Language.RU,
      }),
    ).toThrow('targetUserId is required for SINGLE audience');
  });

  it('SEGMENT: explicit filterStatus overrides the ACTIVE default', () => {
    const svc = new BroadcastAudienceService(makePrisma() as never);
    const where = svc.buildUserWhere({
      audienceType: BroadcastAudience.SEGMENT,
      language: Language.RU,
      filterStatus: UserStatus.BLOCKED,
    });
    expect(where).toEqual({ status: UserStatus.BLOCKED, defaultLanguage: Language.RU });
  });
});

describe('BroadcastAudienceService.previewCounts', () => {
  it('returns total + per-channel reachable counts', async () => {
    const prisma = makePrisma();
    // total, email, push, sms (в порядке вызовов)
    prisma.user.count
      .mockResolvedValueOnce(100) // total
      .mockResolvedValueOnce(80)  // email
      .mockResolvedValueOnce(20)  // push
      .mockResolvedValueOnce(95); // sms
    const svc = new BroadcastAudienceService(prisma as never);
    const res = await svc.previewCounts({
      audienceType: BroadcastAudience.SEGMENT,
      language: Language.RU,
    });
    expect(res).toEqual({
      total: 100,
      perChannel: { inApp: 100, email: 80, push: 20, sms: 95 },
    });
  });
});
