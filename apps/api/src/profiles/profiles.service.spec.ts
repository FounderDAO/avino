import { Language } from '@prisma/client';
import { ProfilesService } from './profiles.service';

/**
 * Юнит-тесты ProfilesService (TASK-040). Prisma мокается — проверяется маппинг
 * camelCase→snake_case и upsert-семантика "создать, если профиля ещё нет".
 */
describe('ProfilesService', () => {
  const USER_ID = 'u1';

  let prisma: any;
  let service: ProfilesService;

  const row = {
    firstName: 'Ali',
    lastName: 'Valiev',
    displayName: 'Ali V.',
    avatarUrl: null,
    contactPhone: '+998901112233',
    contactPhoneVerified: true,
    preferredLanguage: Language.RU,
  };

  beforeEach(() => {
    prisma = {
      userProfile: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
      },
    };
    service = new ProfilesService(prisma);
  });

  describe('getByUserId', () => {
    it('returns null when profile is missing', async () => {
      prisma.userProfile.findUnique.mockResolvedValue(null);
      await expect(service.getByUserId(USER_ID)).resolves.toBeNull();
      expect(prisma.userProfile.findUnique).toHaveBeenCalledWith({
        where: { userId: USER_ID },
      });
    });

    it('maps the row to the snake_case contract', async () => {
      prisma.userProfile.findUnique.mockResolvedValue(row);
      await expect(service.getByUserId(USER_ID)).resolves.toEqual({
        first_name: 'Ali',
        last_name: 'Valiev',
        display_name: 'Ali V.',
        avatar_url: null,
        contact_phone: '+998901112233',
        contact_phone_verified: true,
        preferred_language: Language.RU,
      });
    });
  });

  describe('updateForUser', () => {
    it('upserts (creates if missing) and maps snake_case dto to camelCase data', async () => {
      prisma.userProfile.upsert.mockResolvedValue(row);

      const result = await service.updateForUser(USER_ID, {
        first_name: 'Ali',
        last_name: 'Valiev',
        display_name: 'Ali V.',
        preferred_language: Language.RU,
      });

      const expectedData = {
        firstName: 'Ali',
        lastName: 'Valiev',
        displayName: 'Ali V.',
        avatarUrl: undefined,
        preferredLanguage: Language.RU,
      };
      expect(prisma.userProfile.upsert).toHaveBeenCalledWith({
        where: { userId: USER_ID },
        create: { userId: USER_ID, ...expectedData },
        update: expectedData,
      });
      expect(result.first_name).toBe('Ali');
    });

    it('leaves untouched fields as undefined so Prisma keeps existing values', async () => {
      prisma.userProfile.upsert.mockResolvedValue(row);

      await service.updateForUser(USER_ID, { display_name: 'New Name' });

      const arg = prisma.userProfile.upsert.mock.calls[0][0];
      expect(arg.update.displayName).toBe('New Name');
      expect(arg.update.firstName).toBeUndefined();
      expect(arg.update.lastName).toBeUndefined();
    });
  });
});
