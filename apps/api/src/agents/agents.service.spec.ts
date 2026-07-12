import { UserStatus } from '@prisma/client';
import { AgentsService } from './agents.service';

const AGENT_A = {
  id: 'agent-a',
  status: UserStatus.ACTIVE,
  profile: {
    firstName: 'Алишер',
    lastName: 'Усманов',
    displayName: null,
    avatarUrl: null,
    avatarStorageKey: null,
  },
  agentApplications: [],
};

const AGENT_B = {
  id: 'agent-b',
  status: UserStatus.ACTIVE,
  profile: {
    firstName: 'Ботир',
    lastName: 'Каримов',
    displayName: null,
    avatarUrl: null,
    avatarStorageKey: 'avatars/agent-b.jpg',
  },
  agentApplications: [],
};

const AGENT_WITH_APPLICATION = {
  id: 'agent-c',
  status: UserStatus.ACTIVE,
  profile: {
    firstName: 'Дилноза',
    lastName: 'Юсупова',
    displayName: null,
    avatarUrl: null,
    avatarStorageKey: null,
  },
  agentApplications: [
    { agencyName: 'Avino Realty', about: '10 лет на рынке' },
  ],
};

/**
 * Юнит-тесты AgentsService (ADR-0140, API.md §21). Prisma мокается — список
 * агентов сортируется по числу ACTIVE-листингов (groupBy + сортировка в
 * памяти), agency_name/about берутся из последней APPROVED-заявки, аватар —
 * через общий resolveAvatarUrl (ADR-0134). getById 404 для не-агента.
 */
describe('AgentsService', () => {
  let prisma: any;
  let uploads: any;
  let service: AgentsService;

  beforeEach(() => {
    prisma = {
      user: { findMany: jest.fn(), findFirst: jest.fn() },
      listing: { groupBy: jest.fn() },
    };
    // Аватар резолвится через resolveAvatarUrl (ADR-0134), которое зовёт
    // uploads.getObjectUrl только когда есть avatarStorageKey.
    uploads = {
      getObjectUrl: jest.fn().mockResolvedValue(null),
    };
    service = new AgentsService(prisma, uploads);
  });

  describe('list', () => {
    it('returns agents sorted by active listings count desc', async () => {
      prisma.user.findMany.mockResolvedValue([AGENT_A, AGENT_B]);
      prisma.listing.groupBy.mockResolvedValue([
        { ownerId: AGENT_A.id, _count: { _all: 1 } },
        { ownerId: AGENT_B.id, _count: { _all: 5 } },
      ]);

      const res = await service.list({});

      expect(res.data.map((a) => a.id)).toEqual([AGENT_B.id, AGENT_A.id]);
      expect(res.data[0].active_listings_count).toBe(5);
      expect(res.meta.total).toBe(2);
    });

    it('takes agency_name/about from the latest APPROVED application', async () => {
      prisma.user.findMany.mockResolvedValue([AGENT_WITH_APPLICATION]);
      prisma.listing.groupBy.mockResolvedValue([]);

      const res = await service.list({});

      expect(res.data[0].agency_name).toBe('Avino Realty');
      expect(res.data[0].about).toBe('10 лет на рынке');
    });

    it('resolves avatar via storage key sign-on-read', async () => {
      prisma.user.findMany.mockResolvedValue([AGENT_B]);
      prisma.listing.groupBy.mockResolvedValue([]);
      uploads.getObjectUrl.mockResolvedValue('https://signed/agent-b.jpg');

      const res = await service.list({});

      expect(res.data[0].avatar_url).toBe('https://signed/agent-b.jpg');
      expect(uploads.getObjectUrl).toHaveBeenCalledWith('avatars/agent-b.jpg');
    });

    it('returns the external OAuth avatarUrl as-is when there is no avatarStorageKey (ADR-0134)', async () => {
      const agentOAuthAvatar = {
        ...AGENT_A,
        profile: {
          ...AGENT_A.profile,
          avatarStorageKey: null,
          avatarUrl: 'https://lh3.googleusercontent.com/a/xyz',
        },
      };
      prisma.user.findMany.mockResolvedValue([agentOAuthAvatar]);
      prisma.listing.groupBy.mockResolvedValue([]);

      const res = await service.list({});

      expect(res.data[0].avatar_url).toBe(
        'https://lh3.googleusercontent.com/a/xyz',
      );
      expect(uploads.getObjectUrl).not.toHaveBeenCalled();
    });

    it('defaults to page 1 / limit 20 and paginates in memory', async () => {
      prisma.user.findMany.mockResolvedValue([AGENT_A, AGENT_B]);
      prisma.listing.groupBy.mockResolvedValue([]);

      const res = await service.list({});

      expect(res.meta).toEqual({ page: 1, limit: 20, total: 2 });
    });

    it('name falls back to firstName+lastName when displayName is absent', async () => {
      prisma.user.findMany.mockResolvedValue([AGENT_A]);
      prisma.listing.groupBy.mockResolvedValue([]);

      const res = await service.list({});

      expect(res.data[0].name).toBe('Алишер Усманов');
    });
  });

  describe('getById', () => {
    it('returns the agent profile', async () => {
      prisma.user.findFirst.mockResolvedValue(AGENT_A);
      prisma.listing.groupBy.mockResolvedValue([
        { ownerId: AGENT_A.id, _count: { _all: 3 } },
      ]);

      const res = await service.getById(AGENT_A.id);

      expect(res.id).toBe(AGENT_A.id);
      expect(res.active_listings_count).toBe(3);
    });

    it('404 for a user without AGENT/AGENCY role', async () => {
      prisma.user.findFirst.mockResolvedValue(null);

      await expect(service.getById('some-id')).rejects.toMatchObject({
        response: { code: 'NOT_FOUND' },
      });
    });
  });
});
