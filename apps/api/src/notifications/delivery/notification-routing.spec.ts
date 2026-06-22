import { NotificationChannel, NotificationType } from '@prisma/client';
import {
  EMAIL_THROTTLED_TYPES,
  channelsFor,
  notificationRouting,
} from './notification-routing';

describe('notification-routing', () => {
  describe('notificationRouting', () => {
    it('contains every NotificationType as a key', () => {
      const allTypes = Object.values(NotificationType);
      for (const type of allTypes) {
        expect(notificationRouting).toHaveProperty(type);
      }
    });

    it('SAVED_SEARCH_NEW_LISTING has no EMAIL channel (existing digest)', () => {
      const channels = notificationRouting[NotificationType.SAVED_SEARCH_NEW_LISTING];
      expect(channels).not.toContain(NotificationChannel.EMAIL);
    });

    it('SAVED_SEARCH_NEW_LISTING has PUSH channel', () => {
      const channels = notificationRouting[NotificationType.SAVED_SEARCH_NEW_LISTING];
      expect(channels).toContain(NotificationChannel.PUSH);
    });

    it('PROMOTION_EXPIRED has EMAIL but no PUSH', () => {
      const channels = notificationRouting[NotificationType.PROMOTION_EXPIRED];
      expect(channels).toContain(NotificationChannel.EMAIL);
      expect(channels).not.toContain(NotificationChannel.PUSH);
    });

    it('FAVORITE_PRICE_DROP and PROMOTION_ACTIVATED are empty (no producers)', () => {
      expect(notificationRouting[NotificationType.FAVORITE_PRICE_DROP]).toHaveLength(0);
      expect(notificationRouting[NotificationType.PROMOTION_ACTIVATED]).toHaveLength(0);
    });

    it('NEW_CHAT_MESSAGE has EMAIL and PUSH channels', () => {
      const channels = notificationRouting[NotificationType.NEW_CHAT_MESSAGE];
      expect(channels).toContain(NotificationChannel.EMAIL);
      expect(channels).toContain(NotificationChannel.PUSH);
    });

    it('NEW_LEAD has EMAIL and PUSH channels', () => {
      const channels = notificationRouting[NotificationType.NEW_LEAD];
      expect(channels).toContain(NotificationChannel.EMAIL);
      expect(channels).toContain(NotificationChannel.PUSH);
    });

    it('LISTING_MODERATION_STATUS_CHANGED has EMAIL and PUSH channels', () => {
      const channels = notificationRouting[NotificationType.LISTING_MODERATION_STATUS_CHANGED];
      expect(channels).toContain(NotificationChannel.EMAIL);
      expect(channels).toContain(NotificationChannel.PUSH);
    });
  });

  describe('channelsFor', () => {
    it('filters out IN_APP from result', () => {
      for (const type of Object.values(NotificationType)) {
        const result = channelsFor(type);
        expect(result).not.toContain(NotificationChannel.IN_APP);
      }
    });

    it('returns EMAIL and PUSH for NEW_CHAT_MESSAGE', () => {
      const result = channelsFor(NotificationType.NEW_CHAT_MESSAGE);
      expect(result).toContain(NotificationChannel.EMAIL);
      expect(result).toContain(NotificationChannel.PUSH);
    });

    it('returns only PUSH for SAVED_SEARCH_NEW_LISTING', () => {
      const result = channelsFor(NotificationType.SAVED_SEARCH_NEW_LISTING);
      expect(result).toEqual([NotificationChannel.PUSH]);
    });

    it('returns only EMAIL for PROMOTION_EXPIRED', () => {
      const result = channelsFor(NotificationType.PROMOTION_EXPIRED);
      expect(result).toEqual([NotificationChannel.EMAIL]);
    });

    it('returns empty for FAVORITE_PRICE_DROP', () => {
      expect(channelsFor(NotificationType.FAVORITE_PRICE_DROP)).toHaveLength(0);
    });
  });

  describe('EMAIL_THROTTLED_TYPES', () => {
    it('contains NEW_CHAT_MESSAGE', () => {
      expect(EMAIL_THROTTLED_TYPES.has(NotificationType.NEW_CHAT_MESSAGE)).toBe(true);
    });

    it('does not contain other types like NEW_LEAD', () => {
      expect(EMAIL_THROTTLED_TYPES.has(NotificationType.NEW_LEAD)).toBe(false);
    });
  });
});
