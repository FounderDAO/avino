import { AuditService } from './audit.service';

/**
 * Юнит-тесты AuditService (TASK-131, API.md §16). Prisma мокается — проверяются
 * сборка where-фильтров, дефолты/кап пагинации, сортировка `created_at DESC,
 * id DESC` и snake_case-маппинг ответа (включая nullable actor/metadata).
 */
describe('AuditService', () => {
  let prisma: any;
  let service: AuditService;

  const row = {
    id: 'a1',
    actorId: 'admin-1',
    action: 'ROLE_CHANGE',
    entityType: 'user',
    entityId: 'u1',
    ip: '10.0.0.1',
    userAgent: 'jest',
    metadata: { role: 'AGENT', op: 'grant' },
    createdAt: new Date('2026-06-01T00:00:00Z'),
  };

  beforeEach(() => {
    prisma = {
      auditLog: { findMany: jest.fn(), count: jest.fn() },
    };
    service = new AuditService(prisma);
  });

  it('applies all filters and returns paginated snake_case items', async () => {
    prisma.auditLog.findMany.mockResolvedValue([row]);
    prisma.auditLog.count.mockResolvedValue(1);

    const result = await service.listAuditLogs({
      action: 'ROLE_CHANGE',
      actor_id: 'admin-1',
      entity_type: 'user',
      entity_id: 'u1',
      page: 2,
      limit: 10,
    });

    const args = prisma.auditLog.findMany.mock.calls[0][0];
    expect(args.where).toEqual({
      action: 'ROLE_CHANGE',
      actorId: 'admin-1',
      entityType: 'user',
      entityId: 'u1',
    });
    expect(args.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
    expect(args.skip).toBe(10);
    expect(args.take).toBe(10);
    expect(result.meta).toEqual({ page: 2, limit: 10, total: 1 });
    expect(result.data[0]).toEqual({
      id: 'a1',
      actor_id: 'admin-1',
      action: 'ROLE_CHANGE',
      entity_type: 'user',
      entity_id: 'u1',
      ip: '10.0.0.1',
      user_agent: 'jest',
      metadata: { role: 'AGENT', op: 'grant' },
      created_at: '2026-06-01T00:00:00.000Z',
    });
  });

  it('defaults page/limit, caps limit at 100, empty where without filters', async () => {
    prisma.auditLog.findMany.mockResolvedValue([]);
    prisma.auditLog.count.mockResolvedValue(0);

    await service.listAuditLogs({ limit: 500 });

    const args = prisma.auditLog.findMany.mock.calls[0][0];
    expect(args.where).toEqual({});
    expect(args.take).toBe(100);
    expect(args.skip).toBe(0);
  });

  it('maps null actor and metadata to null', async () => {
    prisma.auditLog.findMany.mockResolvedValue([
      { ...row, actorId: null, entityType: null, entityId: null, metadata: null },
    ]);
    prisma.auditLog.count.mockResolvedValue(1);

    const result = await service.listAuditLogs({});

    expect(result.data[0]).toMatchObject({
      actor_id: null,
      entity_type: null,
      entity_id: null,
      metadata: null,
    });
  });
});
