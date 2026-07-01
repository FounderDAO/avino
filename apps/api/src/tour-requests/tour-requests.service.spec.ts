import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { TourRequestsService } from './tour-requests.service';
import { PrismaService } from '../prisma';
import { NotificationsService } from '../notifications/notifications.service';
import { TourRequestAction } from './dto/tour-request-status.dto';

const future = (days: number): string => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

const ACTIVE_LISTING = {
  id: 'L1', ownerId: 'OWNER1', status: 'ACTIVE', toursEnabled: true,
  tourWindows: [{ start: '07:00', end: '10:00' }],
};

describe('TourRequestsService', () => {
  let service: TourRequestsService;
  let prisma: any;
  let notifications: any;

  beforeEach(async () => {
    prisma = {
      listing: { findFirst: jest.fn() },
      tourRequest: { findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), findMany: jest.fn(), count: jest.fn() },
      $transaction: jest.fn().mockImplementation(async (cb: any) => cb(prisma)),
    };
    notifications = { queueTourRequest: jest.fn(), queueTourStatusChanged: jest.fn() };
    const mod = await Test.createTestingModule({
      providers: [
        TourRequestsService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsService, useValue: notifications },
      ],
    }).compile();
    service = mod.get(TourRequestsService);
  });

  const validDto = () => ({
    listing_id: 'L1', requested_date: future(2), window_start: '07:00', window_end: '10:00',
    requester_name: 'Tap Links', requester_phone: '+998901112233', message: 'hi',
  });

  it('создаёт заявку и ставит NEW_LEAD владельцу', async () => {
    prisma.listing.findFirst.mockResolvedValue(ACTIVE_LISTING);
    prisma.tourRequest.findFirst.mockResolvedValue(null);
    prisma.tourRequest.create.mockResolvedValue({
      id: 'TR1', listingId: 'L1', requesterId: 'U2', status: 'PENDING',
      requestedDate: new Date(`${validDto().requested_date}T00:00:00.000Z`),
      windowStart: '07:00', windowEnd: '10:00', requesterName: 'Tap Links',
      requesterPhone: '+998901112233', message: 'hi', createdAt: new Date(),
    });
    const res = await service.create('U2', validDto() as any);
    expect(res.status).toBe('PENDING');
    expect(notifications.queueTourRequest).toHaveBeenCalledWith(prisma, 'OWNER1', expect.objectContaining({ tourRequestId: 'TR1' }));
  });

  it('409 если tours выключены', async () => {
    prisma.listing.findFirst.mockResolvedValue({ ...ACTIVE_LISTING, toursEnabled: false });
    await expect(service.create('U2', validDto() as any)).rejects.toMatchObject({ status: 409 });
  });

  it('409 если объявление не ACTIVE', async () => {
    prisma.listing.findFirst.mockResolvedValue({ ...ACTIVE_LISTING, status: 'NEW' });
    await expect(service.create('U2', validDto() as any)).rejects.toMatchObject({ status: 409 });
  });

  it('422 если окно не предложено', async () => {
    prisma.listing.findFirst.mockResolvedValue(ACTIVE_LISTING);
    await expect(service.create('U2', { ...validDto(), window_start: '12:00', window_end: '15:00' } as any))
      .rejects.toMatchObject({ status: 422 });
  });

  it('422 если дата в прошлом', async () => {
    prisma.listing.findFirst.mockResolvedValue(ACTIVE_LISTING);
    await expect(service.create('U2', { ...validDto(), requested_date: future(-1) } as any))
      .rejects.toMatchObject({ status: 422 });
  });

  it('422 если дата дальше 30 дней', async () => {
    prisma.listing.findFirst.mockResolvedValue(ACTIVE_LISTING);
    await expect(service.create('U2', { ...validDto(), requested_date: future(40) } as any))
      .rejects.toMatchObject({ status: 422 });
  });

  it('403 если владелец просит тур у себя', async () => {
    prisma.listing.findFirst.mockResolvedValue(ACTIVE_LISTING);
    await expect(service.create('OWNER1', validDto() as any)).rejects.toMatchObject({ status: 403 });
  });

  it('409 TOUR_REQUEST_DUPLICATE при своей активной заявке на слот', async () => {
    prisma.listing.findFirst.mockResolvedValue(ACTIVE_LISTING);
    prisma.tourRequest.findFirst.mockResolvedValue({ requesterId: 'U2' });
    const err = await service.create('U2', validDto() as any).catch((e) => e);
    expect(err.getStatus()).toBe(409);
    expect(err.getResponse()).toMatchObject({ code: 'TOUR_REQUEST_DUPLICATE' });
  });

  it('409 TOUR_SLOT_TAKEN если слот занят чужой активной заявкой', async () => {
    prisma.listing.findFirst.mockResolvedValue(ACTIVE_LISTING);
    prisma.tourRequest.findFirst.mockResolvedValue({ requesterId: 'SOMEONE_ELSE' });
    const err = await service.create('U2', validDto() as any).catch((e) => e);
    expect(err.getStatus()).toBe(409);
    expect(err.getResponse()).toMatchObject({ code: 'TOUR_SLOT_TAKEN' });
  });

  it('проверка занятости учитывает PENDING и CONFIRMED (и только их)', async () => {
    prisma.listing.findFirst.mockResolvedValue(ACTIVE_LISTING);
    prisma.tourRequest.findFirst.mockResolvedValue(null);
    prisma.tourRequest.create.mockResolvedValue({
      id: 'TR1', listingId: 'L1', requesterId: 'U2', status: 'PENDING',
      requestedDate: new Date(`${validDto().requested_date}T00:00:00.000Z`),
      windowStart: '07:00', windowEnd: '10:00', requesterName: 'Tap Links',
      requesterPhone: '+998901112233', message: 'hi', createdAt: new Date(),
    });
    await service.create('U2', validDto() as any);
    expect(prisma.tourRequest.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: ['PENDING', 'CONFIRMED'] },
        }),
        select: { requesterId: true },
      }),
    );
  });

  it('409 TOUR_SLOT_TAKEN при гонке (P2002 на unique-индексе слота)', async () => {
    prisma.listing.findFirst.mockResolvedValue(ACTIVE_LISTING);
    prisma.tourRequest.findFirst.mockResolvedValue(null);
    prisma.$transaction.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    const err = await service.create('U2', validDto() as any).catch((e) => e);
    expect(err.getStatus()).toBe(409);
    expect(err.getResponse()).toMatchObject({ code: 'TOUR_SLOT_TAKEN' });
  });

  it('владелец подтверждает PENDING → CONFIRMED + уведомление покупателю', async () => {
    prisma.tourRequest.findUnique.mockResolvedValue({ id: 'TR1', requesterId: 'U2', status: 'PENDING', listing: { ownerId: 'OWNER1' } });
    prisma.tourRequest.update.mockResolvedValue({
      id: 'TR1', listingId: 'L1', requesterId: 'U2', status: 'CONFIRMED',
      requestedDate: new Date('2026-06-25T00:00:00.000Z'), windowStart: '07:00', windowEnd: '10:00',
      requesterName: 'Tap Links', requesterPhone: '+998901112233', message: null, createdAt: new Date(),
    });
    const res = await service.setStatus('OWNER1', 'TR1', TourRequestAction.CONFIRM);
    expect(res.status).toBe('CONFIRMED');
    expect(notifications.queueTourStatusChanged).toHaveBeenCalledWith(prisma, 'U2', expect.objectContaining({ status: 'CONFIRMED' }));
  });

  it('403 если не-владелец пытается подтвердить', async () => {
    prisma.tourRequest.findUnique.mockResolvedValue({ id: 'TR1', requesterId: 'U2', status: 'PENDING', listing: { ownerId: 'OWNER1' } });
    await expect(service.setStatus('U2', 'TR1', TourRequestAction.CONFIRM)).rejects.toMatchObject({ status: 403 });
  });

  it('422 при недопустимом переходе (confirm уже DECLINED)', async () => {
    prisma.tourRequest.findUnique.mockResolvedValue({ id: 'TR1', requesterId: 'U2', status: 'DECLINED', listing: { ownerId: 'OWNER1' } });
    await expect(service.setStatus('OWNER1', 'TR1', TourRequestAction.CONFIRM)).rejects.toMatchObject({ status: 422 });
  });

  it('покупатель отменяет CONFIRMED → CANCELLED + уведомление владельцу', async () => {
    prisma.tourRequest.findUnique.mockResolvedValue({ id: 'TR1', requesterId: 'U2', status: 'CONFIRMED', listing: { ownerId: 'OWNER1' } });
    prisma.tourRequest.update.mockResolvedValue({
      id: 'TR1', listingId: 'L1', requesterId: 'U2', status: 'CANCELLED',
      requestedDate: new Date('2026-06-25T00:00:00.000Z'), windowStart: '07:00', windowEnd: '10:00',
      requesterName: 'Tap Links', requesterPhone: '+998901112233', message: null, createdAt: new Date(),
    });
    const res = await service.setStatus('U2', 'TR1', TourRequestAction.CANCEL);
    expect(res.status).toBe('CANCELLED');
    expect(notifications.queueTourStatusChanged).toHaveBeenCalledWith(prisma, 'OWNER1', expect.objectContaining({ status: 'CANCELLED' }));
  });

  it('taken: отдаёт активные слоты горизонта без личных данных', async () => {
    prisma.listing.findFirst.mockResolvedValue({ id: 'L1' });
    prisma.tourRequest.findMany.mockResolvedValue([
      { requestedDate: new Date('2026-07-03T00:00:00.000Z'), windowStart: '11:00', windowEnd: '13:00' },
    ]);
    const res = await service.listTakenSlots('L1');
    expect(res).toEqual({
      data: [{ requested_date: '2026-07-03', window_start: '11:00', window_end: '13:00' }],
    });
    expect(prisma.tourRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          listingId: 'L1',
          status: { in: ['PENDING', 'CONFIRMED'] },
        }),
        select: { requestedDate: true, windowStart: true, windowEnd: true },
      }),
    );
  });

  it('taken: 404 если листинг не найден или DELETED', async () => {
    prisma.listing.findFirst.mockResolvedValue(null);
    await expect(service.listTakenSlots('L404')).rejects.toMatchObject({ status: 404 });
  });

  it('taken: границы горизонта — UTC-полночь сегодня .. +30 дней включительно', async () => {
    prisma.listing.findFirst.mockResolvedValue({ id: 'L1' });
    prisma.tourRequest.findMany.mockResolvedValue([]);
    await service.listTakenSlots('L1');
    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const horizon = new Date(today);
    horizon.setUTCDate(horizon.getUTCDate() + 30);
    expect(prisma.tourRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          requestedDate: { gte: today, lte: horizon },
        }),
      }),
    );
  });

  it('setStatus: P2002 при CONFIRM (слот перезанят) → 409 TOUR_SLOT_TAKEN', async () => {
    prisma.tourRequest.findUnique.mockResolvedValue({ id: 'TR1', requesterId: 'U2', status: 'PENDING', listing: { ownerId: 'OWNER1' } });
    prisma.$transaction.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' }),
    );
    const err = await service.setStatus('OWNER1', 'TR1', TourRequestAction.CONFIRM).catch((e) => e);
    expect(err.getStatus()).toBe(409);
    expect(err.getResponse()).toMatchObject({ code: 'TOUR_SLOT_TAKEN' });
  });
});
