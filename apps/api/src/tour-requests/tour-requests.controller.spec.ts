import { TourRequestsController } from './tour-requests.controller';

/**
 * Лёгкий юнит без Nest DI (декораторы @CurrentUser/@Query не участвуют —
 * контроллер вызывается напрямую как обычный класс). Фокус — парсинг query
 * (`parseLimit`/`parseStatus`) перед передачей в сервис.
 */
describe('TourRequestsController', () => {
  let controller: TourRequestsController;
  let service: any;

  beforeEach(() => {
    service = { listOutgoing: jest.fn().mockResolvedValue({ data: [], meta: { limit: 20, total: 0, next_cursor: null } }) };
    controller = new TourRequestsController(service);
  });

  it('валидный status="PENDING" пробрасывается в service как "PENDING"', async () => {
    await controller.outgoing('U1', undefined, undefined, undefined, 'PENDING', undefined);
    expect(service.listOutgoing).toHaveBeenCalledWith(
      'U1',
      expect.objectContaining({ status: 'PENDING' }),
      undefined,
    );
  });

  it('status="toString" (prototype-мусор) → service получает status: undefined', async () => {
    await controller.outgoing('U1', undefined, undefined, undefined, 'toString', undefined);
    expect(service.listOutgoing).toHaveBeenCalledWith(
      'U1',
      expect.objectContaining({ status: undefined }),
      undefined,
    );
  });

  it('status="garbage" → undefined', async () => {
    await controller.outgoing('U1', undefined, undefined, undefined, 'garbage', undefined);
    expect(service.listOutgoing).toHaveBeenCalledWith(
      'U1',
      expect.objectContaining({ status: undefined }),
      undefined,
    );
  });

  it('upcoming="true" → true', async () => {
    await controller.outgoing('U1', undefined, undefined, undefined, undefined, 'true');
    expect(service.listOutgoing).toHaveBeenCalledWith(
      'U1',
      expect.objectContaining({ upcoming: true }),
      undefined,
    );
  });

  it('upcoming отсутствует → false', async () => {
    await controller.outgoing('U1', undefined, undefined, undefined, undefined, undefined);
    expect(service.listOutgoing).toHaveBeenCalledWith(
      'U1',
      expect.objectContaining({ upcoming: false }),
      undefined,
    );
  });

  it('upcoming="1" → false (сравнение строгое с "true")', async () => {
    await controller.outgoing('U1', undefined, undefined, undefined, undefined, '1');
    expect(service.listOutgoing).toHaveBeenCalledWith(
      'U1',
      expect.objectContaining({ upcoming: false }),
      undefined,
    );
  });

  it('limit="20" → 20', async () => {
    await controller.outgoing('U1', undefined, '20', undefined, undefined, undefined);
    expect(service.listOutgoing).toHaveBeenCalledWith(
      'U1',
      expect.objectContaining({ limit: 20 }),
      undefined,
    );
  });

  it('limit="abc" → undefined', async () => {
    await controller.outgoing('U1', undefined, 'abc', undefined, undefined, undefined);
    expect(service.listOutgoing).toHaveBeenCalledWith(
      'U1',
      expect.objectContaining({ limit: undefined }),
      undefined,
    );
  });
});
