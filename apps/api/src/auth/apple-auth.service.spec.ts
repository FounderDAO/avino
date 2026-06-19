import { AppleAuthService } from './apple-auth.service';

jest.mock('apple-signin-auth', () => ({ verifyIdToken: jest.fn() }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const verifyIdToken: jest.Mock = require('apple-signin-auth').verifyIdToken;

function makeService(clientIds: string[], prismaOverrides: object = {}) {
  const config = {
    get: (k: string) => (k === 'apple.clientIds' ? clientIds : undefined),
  };
  const prisma: any = {
    user: {
      findFirst: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    role: { findUnique: jest.fn().mockResolvedValue({ id: 'r1' }) },
    userRole: { create: jest.fn() },
    auditLog: { create: jest.fn() },
    ...prismaOverrides,
  };
  prisma.$transaction = jest.fn(async (cb: any) => cb(prisma));
  const tokenService = {
    issueSession: jest
      .fn()
      .mockResolvedValue({ accessToken: 'a', refreshToken: 'r', expiresIn: 900 }),
  };
  const telegram = { sendAdminAlert: jest.fn().mockResolvedValue(undefined) };
  const service = new AppleAuthService(
    prisma as never,
    config as never,
    tokenService as never,
    telegram as never,
  );
  return { service, prisma, tokenService, telegram };
}

const EXISTING_USER = {
  id: 'u1',
  phone: null,
  email: 'a@b.com',
  defaultLanguage: 'RU',
  status: 'ACTIVE',
  isPhoneVerified: false,
  isEmailVerified: true,
  roles: [{ role: { code: 'USER' } }],
};

describe('AppleAuthService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('503 when APPLE_CLIENT_ID not configured', async () => {
    const { service } = makeService([]);
    await expect(service.login({ id_token: 't' })).rejects.toMatchObject({
      response: { code: 'AUTH_PROVIDER_UNAVAILABLE' },
    });
  });

  it('401 when token invalid', async () => {
    verifyIdToken.mockRejectedValue(new Error('bad'));
    const { service } = makeService(['CID']);
    await expect(service.login({ id_token: 't' })).rejects.toMatchObject({
      response: { code: 'UNAUTHORIZED' },
    });
  });

  it('401 when email not verified', async () => {
    verifyIdToken.mockResolvedValue({
      email: 'a@b.com',
      sub: 's',
      email_verified: false,
    });
    const { service } = makeService(['CID']);
    await expect(service.login({ id_token: 't' })).rejects.toMatchObject({
      response: { code: 'UNAUTHORIZED' },
    });
  });

  it('coerces string email_verified "true" and issues session for existing user', async () => {
    verifyIdToken.mockResolvedValue({
      email: 'a@b.com',
      sub: 's',
      email_verified: 'true',
    });
    const { service, prisma, tokenService } = makeService(['CID']);
    prisma.user.findFirst.mockResolvedValue(EXISTING_USER);
    prisma.user.update.mockResolvedValue(EXISTING_USER);
    const res = await service.login({ id_token: 't' }, '1.1.1.1', 'UA');
    expect(tokenService.issueSession).toHaveBeenCalled();
    expect(res.access_token).toBe('a');
    expect(res.user.email).toBe('a@b.com');
  });

  it('403 when user blocked', async () => {
    verifyIdToken.mockResolvedValue({
      email: 'a@b.com',
      sub: 's',
      email_verified: true,
    });
    const { service, prisma } = makeService(['CID']);
    prisma.user.findFirst.mockResolvedValue({
      ...EXISTING_USER,
      status: 'BLOCKED',
    });
    await expect(service.login({ id_token: 't' })).rejects.toMatchObject({
      response: { code: 'USER_BLOCKED' },
    });
  });

  it('creates a new user seeding profile name from DTO', async () => {
    verifyIdToken.mockResolvedValue({
      email: 'new@b.com',
      sub: 's',
      email_verified: true,
    });
    const { service, prisma } = makeService(['CID']);
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({ id: 'u2' });
    prisma.user.findUniqueOrThrow.mockResolvedValue({
      ...EXISTING_USER,
      id: 'u2',
      email: 'new@b.com',
    });
    const res = await service.login({
      id_token: 't',
      first_name: 'New',
      last_name: 'User',
    });
    expect(prisma.user.create).toHaveBeenCalled();
    const createArg = prisma.user.create.mock.calls[0][0];
    expect(createArg.data.profile.create.displayName).toBe('New User');
    expect(res.user.id).toBe('u2');
  });
});
