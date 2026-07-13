import { HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ApiErrorCode } from '../common/dto/error-response.dto';
import { PrismaService } from '../prisma';
import { TokenService } from './token.service';

/**
 * Integration-тест управления сессиями (ADR-0143) на живом PostgreSQL: сквозной
 * флоу issueSession → listSessions → rotateSession → revokeUserFamily поверх
 * реальных строк `refresh_tokens` (unit-спек мокает Prisma и не проверяет
 * groupBy/инвариант «одна активная строка на family»).
 *
 * Секреты JWT — локальные для теста (ConfigService застаблен): подпись и
 * верификация замкнуты внутри спека, env не нужен. Изоляция — уникальные
 * телефоны; свои строки удаляются точечно в afterAll (гоча #253: без deleteMany
 * по чужим таблицам).
 */
describe('Auth sessions management (integration, ADR-0143)', () => {
  const prisma = new PrismaService();
  const cfg: Record<string, unknown> = {
    'jwt.accessSecret': 'int-access-secret',
    'jwt.refreshSecret': 'int-refresh-secret',
    'jwt.accessTtl': 900,
    'jwt.refreshTtl': 3600,
  };
  const jwt = new JwtService({});
  const tokenService = new TokenService(
    jwt,
    { get: (k: string) => cfg[k] } as unknown as ConfigService,
    prisma,
  );

  const OWNER_PHONE = '+998900000SE1';
  const OTHER_PHONE = '+998900000SE2';

  let ownerId: string;
  let otherId: string;

  /** fid из refresh-JWT (family, которую выпустил issueSession). */
  const fidOf = (refreshToken: string): string =>
    (jwt.decode(refreshToken) as { fid: string }).fid;

  beforeAll(async () => {
    await prisma.$connect();
    const owner = await prisma.user.create({ data: { phone: OWNER_PHONE } });
    const other = await prisma.user.create({ data: { phone: OTHER_PHONE } });
    ownerId = owner.id;
    otherId = other.id;
  });

  afterAll(async () => {
    await prisma.refreshToken.deleteMany({
      where: { userId: { in: [ownerId, otherId] } },
    });
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, otherId] } } });
    await prisma.$disconnect();
  });

  it('walks the full flow: two logins → list → rotation → foreign 404 → revoke → refresh dies', async () => {
    // Два логина с разных устройств → две session family.
    const deviceA = await tokenService.issueSession({
      userId: ownerId,
      roles: ['USER'],
      ip: '10.0.0.1',
      userAgent: 'Chrome on Mac',
    });
    const deviceB = await tokenService.issueSession({
      userId: ownerId,
      roles: ['USER'],
      ip: '10.0.0.2',
      userAgent: 'Safari on iPhone',
    });
    const famA = fidOf(deviceA.refreshToken);
    const famB = fidOf(deviceB.refreshToken);
    expect(famA).not.toBe(famB);

    // access-токен несёт fid своей family (по нему метится is_current).
    const accessPayload = jwt.decode(deviceA.accessToken) as { fid?: string };
    expect(accessPayload.fid).toBe(famA);

    // Список с access-токеном устройства A: обе сессии, текущая — famA.
    let sessions = await tokenService.listSessions(ownerId, famA);
    expect(sessions).toHaveLength(2);
    const byId = new Map(sessions.map((s) => [s.familyId, s]));
    expect(byId.get(famA)).toMatchObject({
      isCurrent: true,
      userAgent: 'Chrome on Mac',
      ip: '10.0.0.1',
    });
    expect(byId.get(famB)).toMatchObject({ isCurrent: false });
    // Ротаций не было → lastRotatedAt совпадает с createdAt.
    for (const s of sessions) {
      expect(s.lastRotatedAt.getTime()).toBe(s.createdAt.getTime());
    }

    // Ротация famB: family та же, lastRotatedAt уезжает вперёд, createdAt
    // (момент логина) сохраняется, активная строка в family ровно одна.
    const rotatedB = await tokenService.rotateSession(deviceB.refreshToken);
    expect(fidOf(rotatedB.refreshToken)).toBe(famB);

    sessions = await tokenService.listSessions(ownerId, famA);
    expect(sessions).toHaveLength(2);
    const afterRotate = sessions.find((s) => s.familyId === famB)!;
    expect(afterRotate.lastRotatedAt.getTime()).toBeGreaterThan(
      afterRotate.createdAt.getTime(),
    );
    const activeB = await prisma.refreshToken.count({
      where: { familyId: famB, revokedAt: null },
    });
    expect(activeB).toBe(1);

    // Чужой пользователь не может ни увидеть, ни отозвать family владельца.
    await expect(tokenService.listSessions(otherId)).resolves.toEqual([]);
    await expect(tokenService.revokeUserFamily(otherId, famA)).resolves.toBe(
      false,
    );
    const stillActiveA = await prisma.refreshToken.count({
      where: { familyId: famA, revokedAt: null },
    });
    expect(stillActiveA).toBe(1);

    // Владелец отзывает famA → из списка пропадает, refresh той family мёртв.
    await expect(tokenService.revokeUserFamily(ownerId, famA)).resolves.toBe(
      true,
    );
    sessions = await tokenService.listSessions(ownerId, famA);
    expect(sessions.map((s) => s.familyId)).toEqual([famB]);

    const deadRefresh = tokenService.rotateSession(deviceA.refreshToken);
    await expect(deadRefresh).rejects.toBeInstanceOf(HttpException);
    try {
      await deadRefresh;
    } catch (e) {
      expect((e as HttpException).getStatus()).toBe(401);
      expect((e as HttpException).getResponse()).toMatchObject({
        code: ApiErrorCode.TOKEN_REUSED,
      });
    }

    // Идемпотентность: повторный отзыв своей (уже отозванной) family → true.
    await expect(tokenService.revokeUserFamily(ownerId, famA)).resolves.toBe(
      true,
    );
  });
});
