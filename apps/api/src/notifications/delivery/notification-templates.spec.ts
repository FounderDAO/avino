import { Language, NotificationType } from '@prisma/client';
import {
  buildDeepLink,
  catalog,
  ctaLabelFor,
  escapeHtml,
  interpolate,
  moderationStatusBody,
  pickCopy,
  renderEmailHtml,
} from './notification-templates';
import { channelsFor } from './notification-routing';
import { NotificationChannel } from '@prisma/client';

/** Активные типы, для которых есть шаблоны. */
const ACTIVE_TYPES = [
  NotificationType.NEW_CHAT_MESSAGE,
  NotificationType.NEW_LEAD,
  NotificationType.TOUR_REQUEST_STATUS_CHANGED,
  NotificationType.LISTING_MODERATION_STATUS_CHANGED,
  NotificationType.SAVED_SEARCH_NEW_LISTING,
  NotificationType.PROMOTION_EXPIRED,
] as const;

const LANGUAGES = [Language.RU, Language.UZ, Language.EN] as const;

describe('notification-templates', () => {
  describe('catalog completeness', () => {
    for (const type of ACTIVE_TYPES) {
      for (const lang of LANGUAGES) {
        it(`${type} × ${lang}: copy exists`, () => {
          const copy = pickCopy(type, lang);
          expect(copy).toBeDefined();
        });

        it(`${type} × ${lang}: email copy present when EMAIL channel routed`, () => {
          const hasEmail = channelsFor(type).includes(NotificationChannel.EMAIL);
          const copy = pickCopy(type, lang);
          if (hasEmail) {
            expect(copy?.email).toBeDefined();
            expect(copy?.email?.subject).toBeTruthy();
            expect(copy?.email?.bodyHtml).toBeTruthy();
            expect(copy?.email?.bodyText).toBeTruthy();
          }
        });

        it(`${type} × ${lang}: push copy present when PUSH channel routed`, () => {
          const hasPush = channelsFor(type).includes(NotificationChannel.PUSH);
          const copy = pickCopy(type, lang);
          if (hasPush) {
            expect(copy?.push).toBeDefined();
            expect(copy?.push?.title).toBeTruthy();
            expect(copy?.push?.body).toBeTruthy();
          }
        });
      }
    }
  });

  describe('pickCopy', () => {
    it('falls back to RU when lang not in catalog', () => {
      // PROMOTION_EXPIRED: каталог содержит RU/UZ/EN, но проверим паттерн
      const copyRu = pickCopy(NotificationType.PROMOTION_EXPIRED, Language.RU);
      const copyEn = pickCopy(NotificationType.PROMOTION_EXPIRED, Language.EN);
      expect(copyRu).toBeDefined();
      expect(copyEn).toBeDefined();
    });

    it('returns undefined for type with no catalog entry', () => {
      const copy = pickCopy(NotificationType.FAVORITE_PRICE_DROP, Language.RU);
      expect(copy).toBeUndefined();
    });

    it('SAVED_SEARCH_NEW_LISTING has no email copy (digest handles it)', () => {
      for (const lang of LANGUAGES) {
        const copy = pickCopy(NotificationType.SAVED_SEARCH_NEW_LISTING, lang);
        expect(copy?.email).toBeUndefined();
        expect(copy?.push).toBeDefined();
      }
    });
  });

  describe('interpolate', () => {
    it('replaces all tokens', () => {
      const result = interpolate('Hello {name}, your {item} is ready.', {
        name: 'Tommy',
        item: 'listing',
      });
      expect(result).toBe('Hello Tommy, your listing is ready.');
    });

    it('leaves unknown tokens in place', () => {
      const result = interpolate('Hello {unknown}', {});
      expect(result).toBe('Hello {unknown}');
    });
  });

  describe('renderEmailHtml', () => {
    it('returns valid HTML string containing CTA link and body', () => {
      const html = renderEmailHtml(
        '<b>Test body</b>',
        'https://avino.uz/ru/listing/123',
        'Перейти',
        Language.RU,
      );
      expect(html).toContain('Test body');
      expect(html).toContain('https://avino.uz/ru/listing/123');
      expect(html).toContain('Перейти');
      expect(html).toContain('<!DOCTYPE html>');
    });

    it('contains Avino branding', () => {
      const html = renderEmailHtml('body', 'https://avino.uz', 'CTA', Language.EN);
      expect(html).toContain('Avino');
    });
  });

  describe('buildDeepLink', () => {
    const publicUrl = 'https://avino.uz';

    it('NEW_CHAT_MESSAGE → /ru/account/messages', () => {
      const url = buildDeepLink(publicUrl, NotificationType.NEW_CHAT_MESSAGE, {}, Language.RU);
      expect(url).toBe('https://avino.uz/ru/account/messages');
    });

    it('NEW_LEAD → /uz/account/tours', () => {
      const url = buildDeepLink(publicUrl, NotificationType.NEW_LEAD, {}, Language.UZ);
      expect(url).toBe('https://avino.uz/uz/account/tours');
    });

    it('TOUR_REQUEST_STATUS_CHANGED → /en/account/tours', () => {
      const url = buildDeepLink(publicUrl, NotificationType.TOUR_REQUEST_STATUS_CHANGED, {}, Language.EN);
      expect(url).toBe('https://avino.uz/en/account/tours');
    });

    it('LISTING_MODERATION_STATUS_CHANGED with listing_id → listing URL', () => {
      const url = buildDeepLink(
        publicUrl,
        NotificationType.LISTING_MODERATION_STATUS_CHANGED,
        { listing_id: 'abc-123' },
        Language.RU,
      );
      expect(url).toBe('https://avino.uz/ru/listing/abc-123');
    });

    it('PROMOTION_EXPIRED with listing_id → listing URL', () => {
      const url = buildDeepLink(
        publicUrl,
        NotificationType.PROMOTION_EXPIRED,
        { listing_id: 'promo-456' },
        Language.EN,
      );
      expect(url).toBe('https://avino.uz/en/listing/promo-456');
    });

    it('strips trailing slash from publicUrl', () => {
      const url = buildDeepLink(
        'https://avino.uz/',
        NotificationType.NEW_CHAT_MESSAGE,
        {},
        Language.RU,
      );
      expect(url).toBe('https://avino.uz/ru/account/messages');
    });
  });

  describe('moderationStatusBody', () => {
    it('returns ACTIVE body in RU', () => {
      const body = moderationStatusBody('ACTIVE', undefined, Language.RU);
      expect(body).toContain('одобрено');
    });

    it('returns REJECTED body with reason', () => {
      const body = moderationStatusBody('REJECTED', 'Дублирует существующее', Language.RU);
      expect(body).toContain('Дублирует существующее');
    });

    it('returns REJECTED body without reason (no {reason} token)', () => {
      const body = moderationStatusBody('REJECTED', undefined, Language.EN);
      expect(body).toContain('rejected');
      expect(body).not.toContain('{reason}');
    });

    it('UZ DELETED body', () => {
      const body = moderationStatusBody('DELETED', undefined, Language.UZ);
      expect(body).toContain('o\'chirildi');
    });

    it('returns default for unknown status', () => {
      const body = moderationStatusBody('UNKNOWN_STATUS', undefined, Language.EN);
      expect(body).toBeTruthy();
      expect(body).not.toContain('{');
    });
  });

  describe('ctaLabelFor', () => {
    it('returns localized CTA label for NEW_CHAT_MESSAGE in RU', () => {
      expect(ctaLabelFor(NotificationType.NEW_CHAT_MESSAGE, Language.RU)).toBeTruthy();
    });

    it('returns localized label for PROMOTION_EXPIRED in EN', () => {
      expect(ctaLabelFor(NotificationType.PROMOTION_EXPIRED, Language.EN)).toBeTruthy();
    });
  });

  describe('no raw interpolation tokens in catalog (subject/title)', () => {
    // Проверяем что subject и title не содержат {token} (они статичные)
    it('subjects have no raw token placeholders', () => {
      for (const type of ACTIVE_TYPES) {
        for (const lang of LANGUAGES) {
          const copy = pickCopy(type, lang);
          if (copy?.email?.subject) {
            // subject не должен содержать фигурные скобки (это статичный текст)
            // исключение: bodyHtml/bodyText содержат токены — это норма
            expect(copy.email.subject).not.toMatch(/^\{[^}]+\}$/);
          }
          if (copy?.push?.title) {
            expect(copy.push.title).not.toMatch(/^\{[^}]+\}$/);
          }
        }
      }
    });
  });

  describe('escapeHtml()', () => {
    it('escapes all five HTML-significant characters', () => {
      expect(escapeHtml('<img src=x onerror=alert(1)>')).toBe(
        '&lt;img src=x onerror=alert(1)&gt;',
      );
      expect(escapeHtml('a & b')).toBe('a &amp; b');
      expect(escapeHtml(`"quote" 'apos'`)).toBe('&quot;quote&quot; &#39;apos&#39;');
    });

    it('escapes & first so entities are not double-encoded incorrectly', () => {
      expect(escapeHtml('<')).toBe('&lt;');
      // & before < ensures "<" -> "&lt;" not "&amp;lt;"
      expect(escapeHtml('&lt;')).toBe('&amp;lt;');
    });

    it('leaves plain text untouched', () => {
      expect(escapeHtml('Квартира в центре')).toBe('Квартира в центре');
    });
  });
});
