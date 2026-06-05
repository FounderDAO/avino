/**
 * seed-admin — создаёт локального ADMIN-пользователя для входа в админку.
 *
 * Используется only для локальной разработки (docker `migrate` service и ручной
 * запуск). В production НЕ выполняется: passwordless-OTP пускает по email, поэтому
 * автосозданный админ без пароля = дыра. Guard по NODE_ENV.
 *
 *   ADMIN_EMAIL=admin@avino.uz node prisma/seed-admin.cjs
 *
 * Идемпотентно: повторный запуск не плодит дубли (роль и связка — upsert).
 */
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const EMAIL = process.env.ADMIN_EMAIL || 'admin@avino.uz';

async function main() {
  if (process.env.NODE_ENV === 'production') {
    console.log('seed-admin: skipped in production');
    return;
  }

  const role = await prisma.role.upsert({
    where: { code: 'ADMIN' },
    update: {},
    create: { code: 'ADMIN', description: 'Администратор системы с полным доступом.' },
  });

  let user = await prisma.user.findFirst({ where: { email: EMAIL, deletedAt: null } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        email: EMAIL,
        isEmailVerified: true,
        status: 'ACTIVE',
        defaultLanguage: 'RU',
        profile: {
          create: {
            firstName: 'Админ',
            lastName: 'Avino',
            displayName: 'Админ Avino',
            preferredLanguage: 'RU',
          },
        },
      },
    });
  }

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: role.id } },
    update: {},
    create: { userId: user.id, roleId: role.id },
  });

  console.log(`seed-admin: ${EMAIL} ready with role ADMIN`);
}

main()
  .catch((e) => {
    console.error('seed-admin failed:', e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
