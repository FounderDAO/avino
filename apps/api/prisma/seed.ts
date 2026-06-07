/**
 * Prisma seed — заполняет справочник `roles` (DB_SCHEMA.md §4).
 *
 * Роли — это сидируемый словарь, а не Postgres enum, поэтому их набор задаётся
 * здесь. Коды берутся из общего enum `UserRole` (@avino/shared), чтобы исключить
 * рассинхрон между БД, API-контрактом и authorization-кодом.
 *
 * GUEST намеренно НЕ сидируется: это неявное состояние неаутентифицированного
 * запроса, не хранится в БД и не является кодом роли (ADR-0008/ADR-011).
 *
 * Seed идемпотентен: каждая роль создаётся через upsert по уникальному `code`,
 * поэтому повторный запуск не плодит дубликаты и обновляет описание.
 */
import { PrismaClient, PromotionType, Currency } from '@prisma/client';
import { UserRole } from '@avino/shared';

const prisma = new PrismaClient();

// Человекочитаемые описания сидируемых ролей. GUEST исключён осознанно.
const ROLE_DESCRIPTIONS: Record<Exclude<UserRole, UserRole.GUEST>, string> = {
  [UserRole.USER]: 'Базовый пользователь портала (поиск, избранное, чат).',
  [UserRole.OWNER]:
    'Собственник недвижимости, размещающий собственные объявления.',
  [UserRole.AGENT]: 'Риелтор/агент, работающий с объявлениями клиентов.',
  [UserRole.AGENCY]:
    'Администратор агентства недвижимости (управляет агентами).',
  [UserRole.LANDLORD]: 'Арендодатель, сдающий объекты в аренду.',
  [UserRole.PROPERTY_MANAGER]:
    'Управляющий недвижимостью от лица собственников.',
  [UserRole.MODERATOR]:
    'Модератор: проверка объявлений, ручная активация продвижения.',
  [UserRole.ADMIN]: 'Администратор системы с полным доступом.',
};

async function main(): Promise<void> {
  const codes = Object.keys(ROLE_DESCRIPTIONS) as Array<
    Exclude<UserRole, UserRole.GUEST>
  >;

  for (const code of codes) {
    await prisma.role.upsert({
      where: { code },
      update: { description: ROLE_DESCRIPTIONS[code] },
      create: { code, description: ROLE_DESCRIPTIONS[code] },
    });
  }

  // eslint-disable-next-line no-console
  console.log(`Seeded ${codes.length} roles: ${codes.join(', ')}`);

  // Тарифы продвижения (TOP/VIP × 7/14/30) — значения совпадают с текущим
  // хардкод-каталогом promotions.catalog.ts. Upsert по (type, periodDays)
  // делает сид идемпотентным и не затирает отредактированные админом цены.
  const PLAN_SEED = [
    { type: PromotionType.TOP, periodDays: 7, price: '50000.00' },
    { type: PromotionType.TOP, periodDays: 14, price: '90000.00' },
    { type: PromotionType.TOP, periodDays: 30, price: '150000.00' },
    { type: PromotionType.VIP, periodDays: 7, price: '120000.00' },
    { type: PromotionType.VIP, periodDays: 14, price: '210000.00' },
    { type: PromotionType.VIP, periodDays: 30, price: '350000.00' },
  ];

  for (const p of PLAN_SEED) {
    await prisma.promotionPlan.upsert({
      where: { type_periodDays: { type: p.type, periodDays: p.periodDays } },
      update: {},
      create: { ...p, currency: Currency.UZS, isActive: true },
    });
  }

  await prisma.appSetting.upsert({
    where: { key: 'promotion_expiry_cron' },
    update: {},
    create: { key: 'promotion_expiry_cron', value: '0 */12 * * *' },
  });

  // eslint-disable-next-line no-console
  console.log(
    `Seeded ${PLAN_SEED.length} promotion plans + promotion_expiry_cron setting`,
  );
}

main()
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
