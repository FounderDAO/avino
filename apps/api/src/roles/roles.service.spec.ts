import { RolesService } from './roles.service';

/**
 * Юнит-тест RolesService (TASK-130, API.md §6). Проверяет, что справочник
 * читается с детерминированной сортировкой по `code` и проксируется как есть.
 */
describe('RolesService', () => {
  it('returns the role dictionary ordered by code', async () => {
    const rows = [
      { code: 'ADMIN', description: 'Администратор' },
      { code: 'USER', description: 'Пользователь' },
    ];
    const prisma: any = {
      role: { findMany: jest.fn().mockResolvedValue(rows) },
    };
    const service = new RolesService(prisma);

    const result = await service.listRoles();

    expect(prisma.role.findMany).toHaveBeenCalledWith({
      select: { code: true, description: true },
      orderBy: { code: 'asc' },
    });
    expect(result).toEqual(rows);
  });
});
