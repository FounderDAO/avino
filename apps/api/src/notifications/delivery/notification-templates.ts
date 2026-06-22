import { Language, NotificationType } from '@prisma/client';

/**
 * Копи одного уведомления для одного языка.
 * email присутствует только для типов с EMAIL-каналом в routing.
 * push присутствует только для типов с PUSH-каналом в routing.
 */
export interface NotificationCopy {
  email?: {
    subject: string;
    bodyHtml: string;
    bodyText: string;
  };
  push?: {
    title: string;
    body: string;
  };
}

/**
 * Каталог локализованных шаблонов уведомлений (ADR-0102, §3.3).
 *
 * Интерполяция — простая замена {token}.
 * Тексты зеркалят клиентские ключи accounts.notifications.types.* (apps/client/messages/).
 *
 * Ключи dataJson для каждого типа (snake_case — так пишут продюсеры):
 *  NEW_CHAT_MESSAGE:                   thread_id, listing_id, message_id, sender_id
 *  NEW_LEAD:                           tour_request_id, listing_id, requested_date, window_start, window_end
 *  TOUR_REQUEST_STATUS_CHANGED:        tour_request_id, listing_id, status
 *  LISTING_MODERATION_STATUS_CHANGED:  listing_id, moderation_action, old_status, new_status, reason
 *  SAVED_SEARCH_NEW_LISTING:           saved_search_id, saved_search_name, listing_id
 *  PROMOTION_EXPIRED:                  listing_id, promotion_id, promotion_type, expired_at
 */
export const catalog: Partial<
  Record<NotificationType, Partial<Record<Language, NotificationCopy>>>
> = {
  // ─── NEW_CHAT_MESSAGE ─────────────────────────────────────────────────────
  [NotificationType.NEW_CHAT_MESSAGE]: {
    [Language.RU]: {
      email: {
        subject: 'Новое сообщение от {senderName}',
        bodyHtml: 'Вам ответили в чате по объявлению <b>{listingTitle}</b>.<br>Нажмите кнопку ниже, чтобы ответить.',
        bodyText: 'Вам ответили в чате по объявлению «{listingTitle}». Ответить: {ctaUrl}',
      },
      push: {
        title: 'Новое сообщение',
        body: 'Вам ответили в чате по объявлению «{listingTitle}».',
      },
    },
    [Language.UZ]: {
      email: {
        subject: '{senderName} dan yangi xabar',
        bodyHtml: '<b>{listingTitle}</b> e\'loni bo\'yicha chatda sizga javob berishdi.<br>Javob berish uchun quyidagi tugmani bosing.',
        bodyText: '«{listingTitle}» e\'loni bo\'yicha chatda sizga javob berishdi. Javob berish: {ctaUrl}',
      },
      push: {
        title: 'Yangi xabar',
        body: '«{listingTitle}» e\'loni bo\'yicha chatda sizga javob berishdi.',
      },
    },
    [Language.EN]: {
      email: {
        subject: 'New message from {senderName}',
        bodyHtml: 'You have a new reply in a chat about <b>{listingTitle}</b>.<br>Click the button below to reply.',
        bodyText: 'You have a new reply in a chat about «{listingTitle}». Reply here: {ctaUrl}',
      },
      push: {
        title: 'New message',
        body: 'You have a new reply in a listing chat about «{listingTitle}».',
      },
    },
  },

  // ─── NEW_LEAD ─────────────────────────────────────────────────────────────
  [NotificationType.NEW_LEAD]: {
    [Language.RU]: {
      email: {
        subject: 'Новый запрос на просмотр вашего объявления',
        bodyHtml: 'По вашему объявлению <b>{listingTitle}</b> поступил новый запрос на просмотр.<br>Нажмите кнопку ниже, чтобы просмотреть заявку.',
        bodyText: 'По вашему объявлению «{listingTitle}» поступил новый запрос на просмотр. Перейти: {ctaUrl}',
      },
      push: {
        title: 'Новый отклик',
        body: 'По вашему объявлению «{listingTitle}» поступил новый отклик.',
      },
    },
    [Language.UZ]: {
      email: {
        subject: 'E\'loningiz bo\'yicha yangi murojaat',
        bodyHtml: '<b>{listingTitle}</b> e\'loningiz bo\'yicha yangi ko\'rib chiqish so\'rovi keldi.<br>So\'rovni ko\'rish uchun quyidagi tugmani bosing.',
        bodyText: '«{listingTitle}» e\'loningiz bo\'yicha yangi ko\'rib chiqish so\'rovi keldi. O\'tish: {ctaUrl}',
      },
      push: {
        title: 'Yangi murojaat',
        body: '«{listingTitle}» e\'loningiz bo\'yicha yangi murojaat keldi.',
      },
    },
    [Language.EN]: {
      email: {
        subject: 'New tour request for your listing',
        bodyHtml: 'You received a new tour request on <b>{listingTitle}</b>.<br>Click the button below to view the request.',
        bodyText: 'You received a new tour request on «{listingTitle}». View here: {ctaUrl}',
      },
      push: {
        title: 'New lead',
        body: 'You received a new lead on your listing «{listingTitle}».',
      },
    },
  },

  // ─── TOUR_REQUEST_STATUS_CHANGED ──────────────────────────────────────────
  [NotificationType.TOUR_REQUEST_STATUS_CHANGED]: {
    [Language.RU]: {
      email: {
        subject: 'Статус вашей заявки на тур изменился',
        bodyHtml: 'Статус вашей заявки на просмотр объявления <b>{listingTitle}</b> изменился.<br>Нажмите кнопку ниже, чтобы проверить детали.',
        bodyText: 'Статус вашей заявки на просмотр объявления «{listingTitle}» изменился. Перейти: {ctaUrl}',
      },
      push: {
        title: 'Статус заявки на тур изменился',
        body: 'Статус вашей заявки на просмотр «{listingTitle}» изменился.',
      },
    },
    [Language.UZ]: {
      email: {
        subject: 'Tur so\'rovingiz holati o\'zgardi',
        bodyHtml: '<b>{listingTitle}</b> e\'loni bo\'yicha ko\'rib chiqish so\'rovingiz holati o\'zgardi.<br>Tafsilotlarni ko\'rish uchun quyidagi tugmani bosing.',
        bodyText: '«{listingTitle}» e\'loni bo\'yicha ko\'rib chiqish so\'rovingiz holati o\'zgardi. O\'tish: {ctaUrl}',
      },
      push: {
        title: 'Tur so\'rovi holati o\'zgardi',
        body: '«{listingTitle}» ko\'rib chiqish so\'rovingiz holati o\'zgardi.',
      },
    },
    [Language.EN]: {
      email: {
        subject: 'Your tour request status has changed',
        bodyHtml: 'The status of your tour request for <b>{listingTitle}</b> has changed.<br>Click the button below to see the details.',
        bodyText: 'The status of your tour request for «{listingTitle}» has changed. View here: {ctaUrl}',
      },
      push: {
        title: 'Tour request status changed',
        body: 'The status of your tour request for «{listingTitle}» has changed.',
      },
    },
  },

  // ─── LISTING_MODERATION_STATUS_CHANGED ────────────────────────────────────
  [NotificationType.LISTING_MODERATION_STATUS_CHANGED]: {
    [Language.RU]: {
      email: {
        subject: 'Статус вашего объявления изменён',
        bodyHtml: 'Статус вашего объявления <b>{listingTitle}</b> обновлён.<br>{statusBody}<br>Нажмите кнопку ниже, чтобы перейти к объявлению.',
        bodyText: 'Статус вашего объявления «{listingTitle}» обновлён. {statusBody} Перейти: {ctaUrl}',
      },
      push: {
        title: 'Статус объявления изменён',
        body: 'Статус вашего объявления «{listingTitle}» обновлён.',
      },
    },
    [Language.UZ]: {
      email: {
        subject: 'E\'lon holati o\'zgardi',
        bodyHtml: '<b>{listingTitle}</b> e\'loningiz holati yangilandi.<br>{statusBody}<br>E\'longa o\'tish uchun quyidagi tugmani bosing.',
        bodyText: '«{listingTitle}» e\'loningiz holati yangilandi. {statusBody} O\'tish: {ctaUrl}',
      },
      push: {
        title: 'E\'lon holati o\'zgardi',
        body: '«{listingTitle}» e\'loningiz holati yangilandi.',
      },
    },
    [Language.EN]: {
      email: {
        subject: 'Your listing status has changed',
        bodyHtml: 'The status of your listing <b>{listingTitle}</b> has been updated.<br>{statusBody}<br>Click the button below to view your listing.',
        bodyText: 'The status of your listing «{listingTitle}» has been updated. {statusBody} View here: {ctaUrl}',
      },
      push: {
        title: 'Listing status changed',
        body: 'Your listing «{listingTitle}» status was updated.',
      },
    },
  },

  // ─── SAVED_SEARCH_NEW_LISTING (только PUSH, email = дайджест) ────────────
  [NotificationType.SAVED_SEARCH_NEW_LISTING]: {
    [Language.RU]: {
      push: {
        title: 'Новое объявление по поиску',
        body: 'Появилось объявление по сохранённому поиску «{searchName}».',
      },
    },
    [Language.UZ]: {
      push: {
        title: 'Qidiruv bo\'yicha yangi e\'lon',
        body: '«{searchName}» saqlangan qidiruvi bo\'yicha yangi e\'lon paydo bo\'ldi.',
      },
    },
    [Language.EN]: {
      push: {
        title: 'New listing for your search',
        body: 'A new listing matched your saved search "{searchName}".',
      },
    },
  },

  // ─── PROMOTION_EXPIRED (только EMAIL) ────────────────────────────────────
  [NotificationType.PROMOTION_EXPIRED]: {
    [Language.RU]: {
      email: {
        subject: 'Продвижение вашего объявления завершено',
        bodyHtml: 'Срок продвижения вашего объявления <b>{listingTitle}</b> истёк.<br>Нажмите кнопку ниже, чтобы продлить продвижение.',
        bodyText: 'Срок продвижения вашего объявления «{listingTitle}» истёк. Перейти: {ctaUrl}',
      },
    },
    [Language.UZ]: {
      email: {
        subject: 'E\'loningiz reklamasi tugadi',
        bodyHtml: '<b>{listingTitle}</b> e\'loningiz reklama muddati tugadi.<br>Reklamani uzaytirish uchun quyidagi tugmani bosing.',
        bodyText: '«{listingTitle}» e\'loningiz reklama muddati tugadi. O\'tish: {ctaUrl}',
      },
    },
    [Language.EN]: {
      email: {
        subject: 'Your listing promotion has ended',
        bodyHtml: 'The promotion for your listing <b>{listingTitle}</b> has expired.<br>Click the button below to renew the promotion.',
        bodyText: 'The promotion for your listing «{listingTitle}» has expired. View here: {ctaUrl}',
      },
    },
  },
};

/**
 * Получить копи для типа и языка с фолбэком на RU.
 */
export function pickCopy(
  type: NotificationType,
  lang: Language,
): NotificationCopy | undefined {
  const byType = catalog[type];
  if (!byType) return undefined;
  return byType[lang] ?? byType[Language.RU];
}

/**
 * Простая интерполяция токенов вида {key} в строке шаблона.
 */
export function interpolate(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? `{${key}}`);
}

/**
 * Брендированная HTML-обёртка для email (inline-стили, email-safe).
 * Принимает уже-интерполированный bodyHtml с CTA-кнопкой.
 */
export function renderEmailHtml(
  bodyHtml: string,
  ctaUrl: string,
  ctaLabel: string,
  _lang: Language,
): string {
  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Avino</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;max-width:600px;width:100%;">
          <!-- Header -->
          <tr>
            <td style="background:#1d4ed8;padding:24px 32px;">
              <span style="color:#ffffff;font-size:24px;font-weight:bold;letter-spacing:-0.5px;">Avino</span>
              <span style="color:#93c5fd;font-size:14px;margin-left:8px;">Недвижимость Узбекистана</span>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;color:#111827;font-size:15px;line-height:1.6;">
              ${bodyHtml}
            </td>
          </tr>
          <!-- CTA -->
          <tr>
            <td style="padding:0 32px 32px;">
              <a href="${ctaUrl}"
                 style="display:inline-block;background:#1d4ed8;color:#ffffff;padding:12px 28px;border-radius:6px;text-decoration:none;font-size:15px;font-weight:600;">
                ${ctaLabel}
              </a>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#f9fafb;padding:16px 32px;color:#6b7280;font-size:12px;border-top:1px solid #e5e7eb;">
              Avino — национальный портал недвижимости Узбекистана.
              Вы получили это письмо, потому что у вас есть аккаунт на <a href="https://avino.uz" style="color:#1d4ed8;text-decoration:none;">avino.uz</a>.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Строит deep-link на публичный портал по типу уведомления и данным dataJson.
 * Формат: /{lang}/... (локализованный путь).
 */
export function buildDeepLink(
  publicUrl: string,
  type: NotificationType,
  dataJson: Record<string, unknown>,
  lang: Language,
): string {
  const base = publicUrl.replace(/\/$/, '');
  const l = lang.toLowerCase(); // RU→ru, UZ→uz, EN→en

  switch (type) {
    case NotificationType.NEW_CHAT_MESSAGE:
      return `${base}/${l}/account/messages`;

    case NotificationType.NEW_LEAD:
    case NotificationType.TOUR_REQUEST_STATUS_CHANGED:
      return `${base}/${l}/account/tours`;

    case NotificationType.LISTING_MODERATION_STATUS_CHANGED:
    case NotificationType.PROMOTION_EXPIRED:
    case NotificationType.SAVED_SEARCH_NEW_LISTING: {
      const listingId =
        (dataJson['listing_id'] as string | undefined) ??
        (dataJson['listingId'] as string | undefined);
      if (listingId) {
        return `${base}/${l}/listing/${listingId}`;
      }
      return `${base}/${l}/account`;
    }

    case NotificationType.FAVORITE_PRICE_DROP:
      return `${base}/${l}/account/favorites`;

    case NotificationType.PROMOTION_ACTIVATED:
      return `${base}/${l}/account/listings`;

    default:
      return `${base}/${l}/account`;
  }
}

/**
 * Локализованный текст CTA-кнопки в email.
 */
export function ctaLabelFor(
  type: NotificationType,
  lang: Language,
): string {
  const labels: Record<Language, Record<string, string>> = {
    [Language.RU]: {
      [NotificationType.NEW_CHAT_MESSAGE]: 'Ответить в чате',
      [NotificationType.NEW_LEAD]: 'Просмотреть заявку',
      [NotificationType.TOUR_REQUEST_STATUS_CHANGED]: 'Посмотреть детали',
      [NotificationType.LISTING_MODERATION_STATUS_CHANGED]: 'Перейти к объявлению',
      [NotificationType.PROMOTION_EXPIRED]: 'Перейти к объявлению',
      default: 'Открыть Avino',
    },
    [Language.UZ]: {
      [NotificationType.NEW_CHAT_MESSAGE]: 'Chatda javob berish',
      [NotificationType.NEW_LEAD]: 'So\'rovni ko\'rish',
      [NotificationType.TOUR_REQUEST_STATUS_CHANGED]: 'Tafsilotlarni ko\'rish',
      [NotificationType.LISTING_MODERATION_STATUS_CHANGED]: 'E\'longa o\'tish',
      [NotificationType.PROMOTION_EXPIRED]: 'E\'longa o\'tish',
      default: 'Avinoni ochish',
    },
    [Language.EN]: {
      [NotificationType.NEW_CHAT_MESSAGE]: 'Reply in chat',
      [NotificationType.NEW_LEAD]: 'View request',
      [NotificationType.TOUR_REQUEST_STATUS_CHANGED]: 'View details',
      [NotificationType.LISTING_MODERATION_STATUS_CHANGED]: 'View listing',
      [NotificationType.PROMOTION_EXPIRED]: 'View listing',
      default: 'Open Avino',
    },
  };

  const byLang = labels[lang] ?? labels[Language.RU];
  return byLang[type] ?? byLang['default'];
}

/**
 * Локализованный statusBody для LISTING_MODERATION_STATUS_CHANGED.
 * Зеркалит body_* ключи в клиентских messages/*.json.
 */
export function moderationStatusBody(
  newStatus: string,
  reason: string | undefined,
  lang: Language,
): string {
  type StatusBodies = {
    ACTIVE: string;
    DRAFT: string;
    REJECTED: string;
    REJECTED_reason: string;
    DELETED: string;
    default: string;
  };

  const bodies: Record<Language, StatusBodies> = {
    [Language.RU]: {
      ACTIVE: 'Ваше объявление одобрено и опубликовано.',
      DRAFT: 'Объявление отправлено в черновики на доработку.',
      REJECTED: 'Объявление отклонено модератором.',
      REJECTED_reason: 'Объявление отклонено модератором. Причина: {reason}',
      DELETED: 'Объявление удалено модератором.',
      default: 'Статус вашего объявления обновлён.',
    },
    [Language.UZ]: {
      ACTIVE: 'E\'loningiz tasdiqlandi va e\'lon qilindi.',
      DRAFT: 'E\'lon qayta ishlash uchun qoralamaga yuborildi.',
      REJECTED: 'E\'lon moderator tomonidan rad etildi.',
      REJECTED_reason: 'E\'lon moderator tomonidan rad etildi. Sababi: {reason}',
      DELETED: 'E\'lon moderator tomonidan o\'chirildi.',
      default: 'E\'loningiz holati yangilandi.',
    },
    [Language.EN]: {
      ACTIVE: 'Your listing was approved and published.',
      DRAFT: 'Your listing was sent back to drafts for changes.',
      REJECTED: 'Your listing was rejected by a moderator.',
      REJECTED_reason: 'Your listing was rejected by a moderator. Reason: {reason}',
      DELETED: 'Your listing was removed by a moderator.',
      default: 'Your listing status was updated.',
    },
  };

  const b = bodies[lang] ?? bodies[Language.RU];

  if (newStatus === 'REJECTED' && reason) {
    return b.REJECTED_reason.replace('{reason}', reason);
  }
  return (b as Record<string, string>)[newStatus] ?? b.default;
}
