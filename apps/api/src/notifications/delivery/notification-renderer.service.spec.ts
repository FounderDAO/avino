import { Language, NotificationType } from '@prisma/client';
import { NotificationRendererService } from './notification-renderer.service';

describe('NotificationRendererService', () => {
  const mockListingTranslation = {
    findFirst: jest.fn(),
  };
  const mockUser = {
    findUnique: jest.fn(),
  };

  const prisma = {
    listingTranslation: mockListingTranslation,
    user: mockUser,
  };

  const config = {
    get: jest.fn((key: string) => {
      if (key === 'app.publicUrl') return 'https://avino.uz';
      return undefined;
    }),
  };

  let service: NotificationRendererService;

  beforeEach(() => {
    jest.resetAllMocks();
    config.get.mockImplementation((key: string) => {
      if (key === 'app.publicUrl') return 'https://avino.uz';
      return undefined;
    });
    service = new NotificationRendererService(prisma as never, config as never);
  });

  describe('renderEmail()', () => {
    it('NEW_LEAD in UZ has UZ subject, listing title, CTA URL', async () => {
      mockListingTranslation.findFirst.mockImplementation(
        ({ where }: { where: { language?: string } }) => {
          if (where.language === Language.UZ) {
            return Promise.resolve({ title: 'Toshkentdagi kvartira' });
          }
          return Promise.resolve({ title: 'Квартира в Ташкенте' });
        },
      );

      const result = await service.renderEmail(
        {
          id: 'notif-1',
          type: NotificationType.NEW_LEAD,
          dataJson: {
            tour_request_id: 'tr-1',
            listing_id: 'list-1',
            requested_date: '2026-07-01',
            window_start: '10:00',
            window_end: '12:00',
          },
        },
        Language.UZ,
      );

      expect(result).not.toBeNull();
      expect(result!.subject).toContain("E'lon"); // UZ subject
      expect(result!.html).toContain('Toshkentdagi kvartira');
      expect(result!.html).toContain('https://avino.uz/uz/account/tours');
      expect(result!.text).toContain('https://avino.uz');
    });

    it('NEW_CHAT_MESSAGE email in EN has listing title and sender name', async () => {
      mockListingTranslation.findFirst.mockResolvedValue({ title: 'City Center Apartment' });
      mockUser.findUnique.mockResolvedValue({
        email: 'john@example.com',
        profile: { displayName: 'John', firstName: null },
      });

      const result = await service.renderEmail(
        {
          id: 'notif-2',
          type: NotificationType.NEW_CHAT_MESSAGE,
          dataJson: {
            thread_id: 'thread-1',
            listing_id: 'list-2',
            message_id: 'msg-1',
            sender_id: 'user-1',
          },
        },
        Language.EN,
      );

      expect(result).not.toBeNull();
      expect(result!.subject).toContain('John');
      expect(result!.html).toContain('City Center Apartment');
    });

    it('LISTING_MODERATION_STATUS_CHANGED ACTIVE in RU has approval text', async () => {
      mockListingTranslation.findFirst.mockResolvedValue({ title: 'Апартаменты' });

      const result = await service.renderEmail(
        {
          id: 'notif-3',
          type: NotificationType.LISTING_MODERATION_STATUS_CHANGED,
          dataJson: {
            listing_id: 'list-3',
            moderation_action: 'APPROVE',
            old_status: 'NEW',
            new_status: 'ACTIVE',
            reason: null,
          },
        },
        Language.RU,
      );

      expect(result).not.toBeNull();
      expect(result!.html).toContain('одобрено');
    });

    it('LISTING_MODERATION_STATUS_CHANGED REJECTED with reason in EN', async () => {
      mockListingTranslation.findFirst.mockResolvedValue({ title: 'Apartment' });

      const result = await service.renderEmail(
        {
          id: 'notif-4',
          type: NotificationType.LISTING_MODERATION_STATUS_CHANGED,
          dataJson: {
            listing_id: 'list-4',
            moderation_action: 'REJECT',
            old_status: 'NEW',
            new_status: 'REJECTED',
            reason: 'Duplicate listing',
          },
        },
        Language.EN,
      );

      expect(result).not.toBeNull();
      expect(result!.html).toContain('Duplicate listing');
    });

    it('returns null for type with no email template (SAVED_SEARCH_NEW_LISTING)', async () => {
      const result = await service.renderEmail(
        {
          id: 'notif-5',
          type: NotificationType.SAVED_SEARCH_NEW_LISTING,
          dataJson: {
            saved_search_id: 'ss-1',
            saved_search_name: 'My Search',
            listing_id: 'list-5',
          },
        },
        Language.RU,
      );

      expect(result).toBeNull();
    });

    it('returns null for type with no template at all (FAVORITE_PRICE_DROP)', async () => {
      const result = await service.renderEmail(
        {
          id: 'notif-6',
          type: NotificationType.FAVORITE_PRICE_DROP,
          dataJson: {},
        },
        Language.RU,
      );

      expect(result).toBeNull();
    });

    it('tolerates missing listing (prisma returns null)', async () => {
      mockListingTranslation.findFirst.mockResolvedValue(null);

      const result = await service.renderEmail(
        {
          id: 'notif-7',
          type: NotificationType.NEW_LEAD,
          dataJson: { listing_id: 'missing-id' },
        },
        Language.RU,
      );

      expect(result).not.toBeNull();
      // listingTitle будет пустым, но рендер не упадёт
      expect(result!.subject).toBeTruthy();
    });

    it('tolerates Prisma error gracefully', async () => {
      mockListingTranslation.findFirst.mockRejectedValue(new Error('DB error'));

      const result = await service.renderEmail(
        {
          id: 'notif-8',
          type: NotificationType.PROMOTION_EXPIRED,
          dataJson: { listing_id: 'err-id', listing_title: 'Fallback' },
        },
        Language.RU,
      );

      expect(result).not.toBeNull();
    });
  });

  describe('renderPush()', () => {
    it('NEW_CHAT_MESSAGE push in EN has EN title and data.threadId', async () => {
      mockListingTranslation.findFirst.mockResolvedValue({ title: 'My Flat' });
      mockUser.findUnique.mockResolvedValue({
        email: 'sender@example.com',
        profile: null,
      });

      const result = await service.renderPush(
        {
          id: 'notif-push-1',
          type: NotificationType.NEW_CHAT_MESSAGE,
          dataJson: {
            thread_id: 'thread-42',
            listing_id: 'list-push-1',
            message_id: 'msg-42',
            sender_id: 'user-42',
          },
        },
        Language.EN,
      );

      expect(result).not.toBeNull();
      expect(result!.title).toContain('New message');
      expect(result!.data['type']).toBe(NotificationType.NEW_CHAT_MESSAGE);
      expect(result!.data['notificationId']).toBe('notif-push-1');
      expect(result!.data['threadId']).toBe('thread-42');
      expect(result!.data['listingId']).toBe('list-push-1');
    });

    it('SAVED_SEARCH_NEW_LISTING push in RU has search name', async () => {
      const result = await service.renderPush(
        {
          id: 'notif-push-2',
          type: NotificationType.SAVED_SEARCH_NEW_LISTING,
          dataJson: {
            saved_search_id: 'ss-1',
            saved_search_name: 'Квартиры в центре',
            listing_id: 'list-push-2',
          },
        },
        Language.RU,
      );

      expect(result).not.toBeNull();
      expect(result!.body).toContain('Квартиры в центре');
    });

    it('returns null for PROMOTION_EXPIRED (no push channel)', async () => {
      const result = await service.renderPush(
        {
          id: 'notif-push-3',
          type: NotificationType.PROMOTION_EXPIRED,
          dataJson: { listing_id: 'list-3' },
        },
        Language.RU,
      );

      expect(result).toBeNull();
    });

    it('data map contains type and notificationId always', async () => {
      mockListingTranslation.findFirst.mockResolvedValue(null);

      const result = await service.renderPush(
        {
          id: 'notif-push-4',
          type: NotificationType.NEW_LEAD,
          dataJson: { listing_id: 'list-4' },
        },
        Language.UZ,
      );

      expect(result).not.toBeNull();
      expect(result!.data['type']).toBe(NotificationType.NEW_LEAD);
      expect(result!.data['notificationId']).toBe('notif-push-4');
    });
  });
});
