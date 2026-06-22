import { FcmService } from './fcm.service';

// Мок firebase-admin/app и firebase-admin/messaging — не загружаем реальный SDK.
const mockGetApps = jest.fn();
const mockInitializeApp = jest.fn();
const mockCert = jest.fn();
const mockSendEachForMulticast = jest.fn();

jest.mock('firebase-admin/app', () => ({
  get getApps() { return mockGetApps; },
  get initializeApp() { return mockInitializeApp; },
  get cert() { return mockCert; },
}));

jest.mock('firebase-admin/messaging', () => ({
  get getMessaging() {
    return () => ({ sendEachForMulticast: mockSendEachForMulticast });
  },
}));

describe('FcmService', () => {
  const makeConfig = (
    projectId?: string,
    clientEmail?: string,
    privateKey?: string,
  ) => ({
    get: jest.fn((key: string) => {
      const map: Record<string, string | undefined> = {
        'firebase.projectId': projectId,
        'firebase.clientEmail': clientEmail,
        'firebase.privateKey': privateKey,
      };
      return map[key];
    }),
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('isConfigured()', () => {
    it('returns false when all creds missing', () => {
      const service = new FcmService(makeConfig() as never);
      expect(service.isConfigured()).toBe(false);
    });

    it('returns false when only projectId is set', () => {
      const service = new FcmService(makeConfig('my-project') as never);
      expect(service.isConfigured()).toBe(false);
    });

    it('returns true when all three creds are set', () => {
      const service = new FcmService(
        makeConfig('proj', 'svc@proj.iam', '-----BEGIN KEY-----') as never,
      );
      expect(service.isConfigured()).toBe(true);
    });
  });

  describe('send() — not configured', () => {
    let service: FcmService;

    beforeEach(() => {
      service = new FcmService(makeConfig() as never);
    });

    it('returns zero counts without initializing firebase', async () => {
      const result = await service.send(['token1'], {
        title: 'Test',
        body: 'Body',
        data: { type: 'NEW_LEAD', notificationId: 'n1' },
      });

      expect(result.successCount).toBe(0);
      expect(result.invalidTokens).toHaveLength(0);
      // firebase-admin/app не должен вызываться
      expect(mockInitializeApp).not.toHaveBeenCalled();
    });

    it('returns empty result for empty token list', async () => {
      const result = await service.send([], {
        title: 'Test',
        body: 'Body',
        data: {},
      });
      expect(result.successCount).toBe(0);
      expect(result.invalidTokens).toHaveLength(0);
    });
  });

  describe('send() — configured (firebase-admin mocked)', () => {
    let service: FcmService;

    beforeEach(() => {
      service = new FcmService(
        makeConfig('proj', 'svc@proj.iam', '-----BEGIN KEY-----') as never,
      );
      // Эмулируем отсутствие уже существующего App
      mockGetApps.mockReturnValue([]);
      mockInitializeApp.mockReturnValue({});
      mockCert.mockReturnValue({});
    });

    it('maps not-registered error to invalidTokens', async () => {
      mockSendEachForMulticast.mockResolvedValue({
        successCount: 1,
        failureCount: 1,
        responses: [
          { success: true },
          {
            success: false,
            error: { code: 'messaging/registration-token-not-registered' },
          },
        ],
      });

      const result = await service.send(['token-ok', 'token-dead'], {
        title: 'Hello',
        body: 'World',
        data: { type: 'NEW_LEAD', notificationId: 'n1' },
      });

      expect(result.successCount).toBe(1);
      expect(result.invalidTokens).toEqual(['token-dead']);
    });

    it('maps invalid-registration-token error to invalidTokens', async () => {
      mockSendEachForMulticast.mockResolvedValue({
        successCount: 0,
        failureCount: 1,
        responses: [
          {
            success: false,
            error: { code: 'messaging/invalid-registration-token' },
          },
        ],
      });

      const result = await service.send(['bad-token'], {
        title: 'Test',
        body: 'Body',
        data: {},
      });

      expect(result.invalidTokens).toEqual(['bad-token']);
    });

    it('does not include non-dead-token errors in invalidTokens', async () => {
      mockSendEachForMulticast.mockResolvedValue({
        successCount: 0,
        failureCount: 1,
        responses: [
          {
            success: false,
            error: { code: 'messaging/internal-error' },
          },
        ],
      });

      const result = await service.send(['some-token'], {
        title: 'Test',
        body: 'Body',
        data: {},
      });

      expect(result.invalidTokens).toHaveLength(0);
    });

    it('all tokens succeed → successCount correct', async () => {
      mockSendEachForMulticast.mockResolvedValue({
        successCount: 2,
        failureCount: 0,
        responses: [{ success: true }, { success: true }],
      });

      const result = await service.send(['t1', 't2'], {
        title: 'Title',
        body: 'Body',
        data: {},
      });

      expect(result.successCount).toBe(2);
      expect(result.invalidTokens).toHaveLength(0);
    });
  });
});
