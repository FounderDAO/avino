import { AgentApplicationStatus } from '@prisma/client';
import { AgentApplicationsService } from './agent-applications.service';

const USER_ID = 'user-1';

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

/**
 * Юнит-тесты AgentApplicationsService (ADR-0140, API.md §21). Prisma
 * мокается — проверяются: 409 ALREADY_AGENT при уже проф. роли,
 * 409 AGENT_APPLICATION_PENDING при существующей PENDING-заявке, создание
 * PENDING-заявки со snake_case-маппингом ответа и 404 на «моя заявка» без
 * поданных заявок.
 */
describe('AgentApplicationsService', () => {
  let prisma: any;
  let service: AgentApplicationsService;

  beforeEach(() => {
    prisma = {
      userRole: { count: jest.fn() },
      agentApplication: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
    };
    service = new AgentApplicationsService(prisma);
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
});
