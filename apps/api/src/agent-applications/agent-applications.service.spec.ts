import { AgentApplicationStatus, Prisma } from '@prisma/client';
import { AgentApplicationsService } from './agent-applications.service';

const USER_ID = 'user-1';
const MODERATOR_ID = 'mod-1';
const ROLE_AGENT_ID = 'role-agent-1';

const ROW_PENDING = {
  id: 'app-1',
  status: AgentApplicationStatus.PENDING,
  agencyName: null,
  about: 'Опытный маклер',
  rejectReason: null,
  createdAt: new Date('2026-06-06T00:00:00Z'),
  resolvedAt: null,
};

const ROW_REJECTED = {
  id: 'app-2',
  status: AgentApplicationStatus.REJECTED,
  agencyName: 'ООО Дома',
  about: 'x',
  rejectReason: 'Недостаточно опыта',
  createdAt: new Date('2026-06-06T00:00:00Z'),
  resolvedAt: new Date('2026-06-07T00:00:00Z'),
};

const ROW_PENDING_FULL = {
  id: 'app-3',
  userId: USER_ID,
  status: AgentApplicationStatus.PENDING,
  agencyName: null,
  about: 'Опытный маклер',
  rejectReason: null,
  moderatorId: null,
  createdAt: new Date('2026-06-06T00:00:00Z'),
  resolvedAt: null,
};

const ROW_PENDING_WITH_USER = {
  ...ROW_PENDING_FULL,
  user: {
    id: USER_ID,
    phone: '+998901234567',
    profile: {
      firstName: 'Алишер',
      lastName: 'Усманов',
      displayName: null,
      avatarUrl: null,
      avatarStorageKey: 'avatars/user-1.jpg',
      contactPhone: null,
    },
  },
};

/**
 * Юнит-тесты AgentApplicationsService (ADR-0140, API.md §21). Prisma
 * мокается — проверяются: 409 ALREADY_AGENT при уже проф. роли,
 * 409 AGENT_APPLICATION_PENDING при существующей PENDING-заявке, создание
 * PENDING-заявки со snake_case-маппингом ответа и 404 на «моя заявка» без
 * поданных заявок; админ-часть — список с фильтром/пагинацией, approve
 * (роль+аудит+уведомление в одной транзакции, идемпотентно), reject,
 * гейты 404/422 на не-PENDING заявку.
 */
describe('AgentApplicationsService', () => {
  let prisma: any;
  let notifications: any;
  let uploads: any;
  let service: AgentApplicationsService;

  beforeEach(() => {
    prisma = {
      userRole: { count: jest.fn(), upsert: jest.fn() },
      agentApplication: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      role: { findUnique: jest.fn() },
      auditLog: { create: jest.fn() },
      // Интерактивная транзакция: коллбэк получает тот же мок (tx === prisma),
      // как в moderation.service.spec.ts.
      $transaction: jest.fn(async (cb: any) => cb(prisma)),
    };
    notifications = {
      queueAgentApplicationResolved: jest.fn().mockResolvedValue(undefined),
    };
    uploads = {
      resolveMediaUrl: jest.fn().mockResolvedValue(null),
    };
    service = new AgentApplicationsService(prisma, notifications, uploads);
  });

  describe('create', () => {
    it('creates a PENDING application and returns snake_case response', async () => {
      prisma.userRole.count.mockResolvedValue(0);
      prisma.agentApplication.findFirst.mockResolvedValue(null);
      prisma.agentApplication.create.mockResolvedValue(ROW_PENDING);

      const res = await service.create(USER_ID, { about: 'Опытный маклер' });

      expect(res.status).toBe('PENDING');
      expect(res.agency_name).toBeNull();
      expect(prisma.agentApplication.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: USER_ID,
            about: 'Опытный маклер',
            agencyName: null,
          }),
        }),
      );
    });

    it('409 ALREADY_AGENT when user already has AGENT/AGENCY role', async () => {
      prisma.userRole.count.mockResolvedValue(1);

      await expect(service.create(USER_ID, { about: 'x' })).rejects.toMatchObject({
        response: { code: 'ALREADY_AGENT' },
      });
      expect(prisma.agentApplication.create).not.toHaveBeenCalled();
    });

    it('409 AGENT_APPLICATION_PENDING when a pending application exists', async () => {
      prisma.userRole.count.mockResolvedValue(0);
      prisma.agentApplication.findFirst.mockResolvedValue(ROW_PENDING);

      await expect(service.create(USER_ID, { about: 'x' })).rejects.toMatchObject({
        response: { code: 'AGENT_APPLICATION_PENDING' },
      });
      expect(prisma.agentApplication.create).not.toHaveBeenCalled();
    });

    it('409 AGENT_APPLICATION_PENDING when create() races into a P2002 unique violation', async () => {
      prisma.userRole.count.mockResolvedValue(0);
      prisma.agentApplication.findFirst.mockResolvedValue(null);
      prisma.agentApplication.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: '0',
        }),
      );

      await expect(service.create(USER_ID, { about: 'x' })).rejects.toMatchObject({
        response: { code: 'AGENT_APPLICATION_PENDING' },
      });
    });

    it('rethrows a non-P2002 error from create() as-is', async () => {
      prisma.userRole.count.mockResolvedValue(0);
      prisma.agentApplication.findFirst.mockResolvedValue(null);
      const err = new Error('boom');
      prisma.agentApplication.create.mockRejectedValue(err);

      await expect(service.create(USER_ID, { about: 'x' })).rejects.toBe(err);
    });

    it('trims about, and blank agency_name becomes null', async () => {
      prisma.userRole.count.mockResolvedValue(0);
      prisma.agentApplication.findFirst.mockResolvedValue(null);
      prisma.agentApplication.create.mockResolvedValue(ROW_PENDING);

      await service.create(USER_ID, { agency_name: '   ', about: '  x  ' });

      expect(prisma.agentApplication.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ agencyName: null, about: 'x' }),
        }),
      );
    });
  });

  describe('getMine', () => {
    it('returns the latest application', async () => {
      prisma.agentApplication.findFirst.mockResolvedValue(ROW_REJECTED);

      const res = await service.getMine(USER_ID);

      expect(res.status).toBe('REJECTED');
      expect(prisma.agentApplication.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { createdAt: 'desc' } }),
      );
    });

    it('404 when the user never applied', async () => {
      prisma.agentApplication.findFirst.mockResolvedValue(null);

      await expect(service.getMine(USER_ID)).rejects.toMatchObject({
        response: { code: 'NOT_FOUND' },
      });
    });
  });

  describe('approve', () => {
    it('sets APPROVED, grants AGENT role, queues notification in one tx', async () => {
      prisma.agentApplication.findUnique.mockResolvedValue({
        ...ROW_PENDING_FULL,
      });
      prisma.role.findUnique.mockResolvedValue({ id: ROLE_AGENT_ID });
      prisma.agentApplication.update.mockResolvedValue({
        ...ROW_PENDING_WITH_USER,
        status: AgentApplicationStatus.APPROVED,
        moderatorId: MODERATOR_ID,
      });

      const res = await service.approve(MODERATOR_ID, ROW_PENDING_FULL.id);

      expect(res.status).toBe('APPROVED');
      // tx === prisma в этом харнесе (см. beforeEach): $transaction(cb) => cb(prisma).
      expect(prisma.userRole.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId_roleId: { userId: USER_ID, roleId: ROLE_AGENT_ID } },
          create: expect.objectContaining({ grantedBy: MODERATOR_ID }),
        }),
      );
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            actorId: MODERATOR_ID,
            action: 'ROLE_CHANGE',
            entityId: USER_ID,
          }),
        }),
      );
      expect(notifications.queueAgentApplicationResolved).toHaveBeenCalledWith(
        prisma,
        USER_ID,
        expect.objectContaining({ status: 'APPROVED' }),
      );
    });

    it('is idempotent: upserts the role instead of failing when it already exists', async () => {
      prisma.agentApplication.findUnique.mockResolvedValue({
        ...ROW_PENDING_FULL,
      });
      prisma.role.findUnique.mockResolvedValue({ id: ROLE_AGENT_ID });
      prisma.agentApplication.update.mockResolvedValue({
        ...ROW_PENDING_WITH_USER,
        status: AgentApplicationStatus.APPROVED,
        moderatorId: MODERATOR_ID,
      });

      await service.approve(MODERATOR_ID, ROW_PENDING_FULL.id);

      expect(prisma.userRole.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ update: {} }),
      );
    });

    it('422 INVALID_STATUS_TRANSITION for non-PENDING application', async () => {
      prisma.agentApplication.findUnique.mockResolvedValue({
        ...ROW_PENDING_FULL,
        status: AgentApplicationStatus.APPROVED,
      });

      await expect(
        service.approve(MODERATOR_ID, ROW_PENDING_FULL.id),
      ).rejects.toMatchObject({
        response: { code: 'INVALID_STATUS_TRANSITION' },
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('404 for missing application', async () => {
      prisma.agentApplication.findUnique.mockResolvedValue(null);

      await expect(
        service.approve(MODERATOR_ID, 'missing'),
      ).rejects.toMatchObject({
        response: { code: 'NOT_FOUND' },
      });
    });
  });

  describe('reject', () => {
    it('sets REJECTED with reason and queues notification', async () => {
      prisma.agentApplication.findUnique.mockResolvedValue({
        ...ROW_PENDING_FULL,
      });
      prisma.agentApplication.update.mockResolvedValue({
        ...ROW_PENDING_WITH_USER,
        status: AgentApplicationStatus.REJECTED,
        rejectReason: 'нет данных',
        moderatorId: MODERATOR_ID,
      });

      const res = await service.reject(MODERATOR_ID, ROW_PENDING_FULL.id, {
        reason: 'нет данных',
      });

      expect(res.status).toBe('REJECTED');
      expect(res.reject_reason).toBe('нет данных');
      expect(notifications.queueAgentApplicationResolved).toHaveBeenCalledWith(
        prisma,
        USER_ID,
        expect.objectContaining({
          status: 'REJECTED',
          rejectReason: 'нет данных',
        }),
      );
      // reject не выдаёт роль и не пишет ROLE_CHANGE в аудит.
      expect(prisma.userRole.upsert).not.toHaveBeenCalled();
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    });

    it('404 for missing application', async () => {
      prisma.agentApplication.findUnique.mockResolvedValue(null);

      await expect(
        service.reject(MODERATOR_ID, 'missing', {}),
      ).rejects.toMatchObject({
        response: { code: 'NOT_FOUND' },
      });
    });

    it('422 INVALID_STATUS_TRANSITION for non-PENDING application', async () => {
      prisma.agentApplication.findUnique.mockResolvedValue({
        ...ROW_PENDING_FULL,
        status: AgentApplicationStatus.REJECTED,
      });

      await expect(
        service.reject(MODERATOR_ID, ROW_PENDING_FULL.id, {}),
      ).rejects.toMatchObject({
        response: { code: 'INVALID_STATUS_TRANSITION' },
      });
    });
  });

  describe('listAdmin', () => {
    it('filters by status and returns applicant info with resolved avatar', async () => {
      prisma.agentApplication.findMany.mockResolvedValue([
        ROW_PENDING_WITH_USER,
      ]);
      prisma.agentApplication.count.mockResolvedValue(1);
      uploads.resolveMediaUrl.mockResolvedValue('https://signed/avatar.jpg');

      const res = await service.listAdmin({
        status: AgentApplicationStatus.PENDING,
      });

      expect(res.meta.total).toBe(1);
      expect(prisma.agentApplication.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: AgentApplicationStatus.PENDING },
        }),
      );
      expect(res.data[0].user).toEqual(
        expect.objectContaining({
          avatar_url: 'https://signed/avatar.jpg',
          name: 'Алишер Усманов',
        }),
      );
    });

    it('defaults to page 1 / limit 20 with no status filter', async () => {
      prisma.agentApplication.findMany.mockResolvedValue([]);
      prisma.agentApplication.count.mockResolvedValue(0);

      const res = await service.listAdmin({});

      expect(res.meta).toEqual({ page: 1, limit: 20, total: 0 });
      expect(prisma.agentApplication.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {}, skip: 0, take: 20 }),
      );
    });

    it('leaves avatar_url null and skips resolveMediaUrl when applicant has no avatar', async () => {
      const rowNoAvatar = {
        ...ROW_PENDING_WITH_USER,
        user: {
          ...ROW_PENDING_WITH_USER.user,
          profile: {
            ...ROW_PENDING_WITH_USER.user.profile,
            avatarStorageKey: null,
            avatarUrl: null,
          },
        },
      };
      prisma.agentApplication.findMany.mockResolvedValue([rowNoAvatar]);
      prisma.agentApplication.count.mockResolvedValue(1);

      const res = await service.listAdmin({});

      expect(res.data[0].user.avatar_url).toBeNull();
      expect(uploads.resolveMediaUrl).not.toHaveBeenCalled();
    });
  });
});
