import {
  Currency,
  Language,
  ListingStatus,
  NotificationType,
  PropertyType,
  TransactionType,
  TranslationSource,
} from '@prisma/client';
import { DistrictsService } from '../geo';
import { NotificationsService } from '../notifications';
import { PrismaService } from '../prisma';
import { SearchService } from '../search/search.service';
import { TranslationsService } from '../translations';
import { UploadsService } from '../uploads';
import { AgentsService } from '../agents';
import { AgentApplicationsService } from './agent-applications.service';

// Медиа-подпись здесь не тестируется (ADR-0086) — echo сохранённого url, без S3.
// getObjectUrl вызывается только при наличии avatarStorageKey (у наших users его
// нет), поэтому resolveAvatarUrl вернёт null не трогая S3.
const uploadsStub = {
  resolveMediaUrl: async (_key: string | null | undefined, url: string) => url,
  getObjectUrl: async () => null,
} as unknown as UploadsService;

/**
 * Integration-тест сквозного флоу заявок «Стать агентом» (ADR-0140, API.md §21)
 * на живом PostgreSQL. В отличие от unit-спека (Prisma мокается) здесь проходит
 * весь путь через реальную БД: подача PENDING, страховка от дубля (проверка
 * сервиса + partial unique index на уровне БД), одобрение в транзакции (роль
 * AGENT + аудит + IN_APP-уведомление), публичный каталог агентов, фильтр
 * `/search?agent_id`, гейт ALREADY_AGENT и ветка отклонения с повторной подачей.
 *
 * Изоляция — уникальные телефоны/CITY_ID; свои строки удаляются точечно в
 * afterAll (по собранным id, в порядке FK-зависимостей — гоча #253: без
 * deleteMany по чужим таблицам).
 */
describe('AgentApplications end-to-end flow (integration, ADR-0140)', () => {
  const prisma = new PrismaService();
  const notifications = new NotificationsService(prisma);
  const applications = new AgentApplicationsService(
    prisma,
    notifications,
    uploadsStub,
  );
  const agents = new AgentsService(prisma, uploadsStub);
  const search = new SearchService(
    prisma,
    new TranslationsService(prisma),
    new DistrictsService(prisma),
    uploadsStub,
  );

  // Уникальные телефоны/город изолируют строки этого прогона от сида и соседей.
  const APPLICANT_PHONE = '+998900000AA9';
  const MODERATOR_PHONE = '+998900000MM9';
  const OTHER_PHONE = '+998900000OO9';
  const CITY_ID = '99999999-9999-4999-8999-000000000009';
  const LISTING_ID = 'a9999999-0000-4000-8000-000000000009';

  let applicantId: string;
  let moderatorId: string;
  let otherApplicantId: string;

  beforeAll(async () => {
    await prisma.$connect();

    // Роль AGENT: approve() падает, если её нет в БД (idempotent upsert как в
    // харнесе листингов — переживает уже засиженную роль).
    await prisma.role.upsert({
      where: { code: 'AGENT' },
      update: {},
      create: { code: 'AGENT' },
    });

    // Заявитель с профилем (даёт name в карточке агента); без проф. роли.
    const applicant = await prisma.user.create({
      data: {
        phone: APPLICANT_PHONE,
        profile: {
          create: { displayName: 'Пётр Маклеров', firstName: 'Пётр' },
        },
      },
    });
    applicantId = applicant.id;

    const moderator = await prisma.user.create({
      data: { phone: MODERATOR_PHONE },
    });
    moderatorId = moderator.id;

    const other = await prisma.user.create({ data: { phone: OTHER_PHONE } });
    otherApplicantId = other.id;
  });

  afterAll(async () => {
    const userIds = [applicantId, moderatorId, otherApplicantId].filter(
      (id): id is string => Boolean(id),
    );
    // Листинги — раньше пользователей (owner FK ON DELETE RESTRICT); фильтр по
    // нашему уникальному city_id удаляет только свои строки.
    await prisma.listing.deleteMany({ where: { cityId: CITY_ID } });
    // Аудит ROLE_CHANGE (actor SET NULL, entity_id — не FK) не каскадится с
    // пользователем — удаляем свои строки точечно по нашим id.
    if (userIds.length > 0) {
      await prisma.auditLog.deleteMany({
        where: {
          OR: [{ actorId: { in: userIds } }, { entityId: { in: userIds } }],
        },
      });
      // Удаление пользователя каскадит его agent_applications, user_roles и
      // notifications (все onDelete: Cascade) — это наши же строки.
      for (const id of userIds) {
        await prisma.user.delete({ where: { id } });
      }
    }
    await prisma.$disconnect();
  });

  it('apply → pending blocks duplicate → approve grants AGENT → agents list & search filter → reject branch', async () => {
    // 1–2. Подача заявки → PENDING.
    const created = await applications.create(applicantId, {
      about: 'Опытный маклер, 5 лет на рынке',
      agency_name: 'Дом и Ключ',
    });
    expect(created.status).toBe('PENDING');
    expect(created.resolved_at).toBeNull();
    const appId = created.id;

    // 3a. Повторная подача через сервис → 409 AGENT_APPLICATION_PENDING.
    await expect(
      applications.create(applicantId, { about: 'ещё раз' }),
    ).rejects.toMatchObject({ response: { code: 'AGENT_APPLICATION_PENDING' } });

    // 3b. Прямой prisma.create второй PENDING-строки → partial unique index в
    // БД (user_id WHERE status='PENDING') бросает нарушение уникальности.
    await expect(
      prisma.agentApplication.create({
        data: { userId: applicantId, about: 'обход сервиса' },
      }),
    ).rejects.toThrow();

    // 4. Одобрение модератором.
    const approved = await applications.approve(moderatorId, appId);
    expect(approved.status).toBe('APPROVED');
    expect(approved.resolved_at).not.toBeNull();
    expect(approved.moderator_id).toBe(moderatorId);

    // user_roles содержит AGENT для заявителя.
    const agentRole = await prisma.userRole.findFirst({
      where: { userId: applicantId, role: { code: 'AGENT' } },
    });
    expect(agentRole).not.toBeNull();

    // notifications: AGENT_APPLICATION_RESOLVED с application_id заявки.
    const approveNotif = await prisma.notification.findFirst({
      where: {
        userId: applicantId,
        type: NotificationType.AGENT_APPLICATION_RESOLVED,
      },
    });
    expect(approveNotif).not.toBeNull();
    expect(approveNotif?.dataJson).toMatchObject({
      application_id: appId,
      status: 'APPROVED',
    });

    // 5. ACTIVE-объявление заявителя (минимальный create как в харнесе листингов).
    await prisma.listing.create({
      data: {
        id: LISTING_ID,
        ownerId: applicantId,
        transactionType: TransactionType.SALE,
        propertyType: PropertyType.APARTMENT,
        status: ListingStatus.ACTIVE,
        originalLanguage: Language.RU,
        price: '100000.00',
        currency: Currency.UZS,
        cityId: CITY_ID,
        translations: {
          create: [
            {
              language: Language.RU,
              title: 'Квартира агента',
              source: TranslationSource.USER,
            },
          ],
        },
      },
    });

    // 6. Каталог агентов: заявитель присутствует, active_listings_count == 1.
    const list = await agents.list({ page: 1, limit: 100 });
    const inList = list.data.find((a) => a.id === applicantId);
    expect(inList).toBeDefined();
    expect(inList?.name).toBe('Пётр Маклеров');
    expect(inList?.active_listings_count).toBe(1);
    // Детерминированная проверка счётчика через getById (не зависит от пагинации).
    const card = await agents.getById(applicantId);
    expect(card.active_listings_count).toBe(1);
    expect(card.agency_name).toBe('Дом и Ключ'); // из APPROVED-заявки

    // 7. /search?agent_id — только объявления этого агента.
    const searchRes = await search.search({ agent_id: applicantId, limit: 100 });
    expect(searchRes.data.map((d) => d.id)).toEqual([LISTING_ID]);
    expect(searchRes.meta.total).toBe(1);

    // 8. Повторная подача уже агентом → 409 ALREADY_AGENT.
    await expect(
      applications.create(applicantId, { about: 'снова' }),
    ).rejects.toMatchObject({ response: { code: 'ALREADY_AGENT' } });

    // 9. Ветка отклонения: заявка второго пользователя → REJECTED + уведомление,
    //    после чего допустима повторная подача (новая PENDING-строка).
    const otherApp = await applications.create(otherApplicantId, {
      about: 'Тоже хочу стать агентом',
    });
    expect(otherApp.status).toBe('PENDING');

    const rejected = await applications.reject(moderatorId, otherApp.id, {
      reason: 'Недостаточно опыта',
    });
    expect(rejected.status).toBe('REJECTED');
    expect(rejected.reject_reason).toBe('Недостаточно опыта');
    expect(rejected.resolved_at).not.toBeNull();

    const rejectNotif = await prisma.notification.findFirst({
      where: {
        userId: otherApplicantId,
        type: NotificationType.AGENT_APPLICATION_RESOLVED,
      },
    });
    expect(rejectNotif?.dataJson).toMatchObject({
      application_id: otherApp.id,
      status: 'REJECTED',
      reject_reason: 'Недостаточно опыта',
    });

    // Повторная подача после REJECTED — новая заявка (история сохранена).
    const reApplied = await applications.create(otherApplicantId, {
      about: 'Вторая попытка с портфолио',
    });
    expect(reApplied.status).toBe('PENDING');
    expect(reApplied.id).not.toBe(otherApp.id);

    // Отклонённый пользователь роль AGENT не получил → в каталог не попадает.
    await expect(agents.getById(otherApplicantId)).rejects.toMatchObject({
      response: { code: 'NOT_FOUND' },
    });
  });
});
