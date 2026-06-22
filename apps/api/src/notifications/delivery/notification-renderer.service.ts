import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Language, NotificationType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma';
import {
  buildDeepLink,
  ctaLabelFor,
  escapeHtml,
  interpolate,
  moderationStatusBody,
  pickCopy,
  renderEmailHtml,
} from './notification-templates';

/** Результат рендера email-уведомления. */
export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/** Результат рендера push-уведомления. */
export interface RenderedPush {
  title: string;
  body: string;
  /** Строковая карта для FCM data payload — навигация в приложении. */
  data: Record<string, string>;
}

/**
 * Контекст уведомления — минимальный набор данных для рендера.
 * Соответствует полям NotificationDelivery → notification.
 */
export interface NotificationContext {
  id: string;
  type: NotificationType;
  dataJson: Prisma.JsonValue;
}

/**
 * NotificationRenderer — рендерит локализованный email/push из уведомления.
 *
 * Загружает связанные сущности (listing title, sender display name) через Prisma
 * для наполнения шаблона. Толерантен к отсутствию сущностей — использует
 * фолбэк-копи. Не выбрасывает исключений (null при отсутствии шаблона).
 *
 * Резолюция языка: profile.preferredLanguage ?? user.defaultLanguage → RU.
 */
@Injectable()
export class NotificationRendererService {
  private readonly logger = new Logger(NotificationRendererService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Рендерит email для уведомления на указанном языке.
   * Возвращает null, если тип не имеет email-шаблона.
   */
  async renderEmail(
    n: NotificationContext,
    lang: Language,
  ): Promise<RenderedEmail | null> {
    const copy = pickCopy(n.type, lang);
    if (!copy?.email) {
      return null;
    }

    const data = this.dataJsonAsRecord(n.dataJson);
    const publicUrl = this.config.get<string>('app.publicUrl') ?? 'https://avino.uz';

    const vars = await this.buildInterpolationVars(n, data, lang, publicUrl);

    // subject и text — plain-text (raw). HTML-тело интерполируем ЭКРАНИРОВАННЫМИ
    // значениями (listingTitle/statusBody — free-text/ввод модератора), при этом
    // статический HTML шаблона (<b>, <br>) остаётся литеральным.
    const htmlVars = this.escapeVarsForHtml(vars);
    const subject = interpolate(copy.email.subject, vars);
    const bodyHtml = interpolate(copy.email.bodyHtml, htmlVars);
    const bodyText = interpolate(copy.email.bodyText, vars);

    const ctaUrl = vars['ctaUrl'] ?? buildDeepLink(publicUrl, n.type, data, lang);
    const ctaLabel = ctaLabelFor(n.type, lang);

    const html = renderEmailHtml(bodyHtml, ctaUrl, ctaLabel, lang);

    return { subject, html, text: bodyText };
  }

  /**
   * Рендерит push для уведомления на указанном языке.
   * Возвращает null, если тип не имеет push-шаблона.
   */
  async renderPush(
    n: NotificationContext,
    lang: Language,
  ): Promise<RenderedPush | null> {
    const copy = pickCopy(n.type, lang);
    if (!copy?.push) {
      return null;
    }

    const data = this.dataJsonAsRecord(n.dataJson);
    const publicUrl = this.config.get<string>('app.publicUrl') ?? 'https://avino.uz';

    const vars = await this.buildInterpolationVars(n, data, lang, publicUrl);

    const title = interpolate(copy.push.title, vars);
    const body = interpolate(copy.push.body, vars);

    // Data payload для навигации в мобильном приложении.
    const pushData: Record<string, string> = {
      type: n.type,
      notificationId: n.id,
    };
    if (data['listing_id']) pushData['listingId'] = String(data['listing_id']);
    if (data['thread_id']) pushData['threadId'] = String(data['thread_id']);

    return { title, body, data: pushData };
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  /**
   * Безопасно привести Prisma.JsonValue к Record<string, unknown>.
   * Всё что не объект → пустой объект.
   */
  private dataJsonAsRecord(raw: Prisma.JsonValue): Record<string, unknown> {
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      return raw as Record<string, unknown>;
    }
    return {};
  }

  /**
   * HTML-экранированная копия карты переменных — для интерполяции в HTML-тело
   * письма. Экранируем ЗНАЧЕНИЯ (а не шаблон), чтобы пользовательский ввод
   * (заголовок объявления, reason) не мог внедрить разметку в письмо.
   */
  private escapeVarsForHtml(
    vars: Record<string, string>,
  ): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(vars)) {
      out[key] = escapeHtml(value);
    }
    return out;
  }

  /**
   * Собрать карту переменных для интерполяции шаблона.
   * Загружает заголовок объявления и имя отправителя из БД (толерантно).
   */
  private async buildInterpolationVars(
    n: NotificationContext,
    data: Record<string, unknown>,
    lang: Language,
    publicUrl: string,
  ): Promise<Record<string, string>> {
    const vars: Record<string, string> = {};

    // CTA deep-link.
    vars['ctaUrl'] = buildDeepLink(publicUrl, n.type, data, lang);

    // Заголовок объявления.
    const listingId = this.strVal(data['listing_id'] ?? data['listingId']);
    if (listingId) {
      vars['listingTitle'] = await this.resolveListingTitle(listingId, lang);
    } else {
      vars['listingTitle'] = '';
    }

    // Имя отправителя (чат).
    const senderId = this.strVal(data['sender_id'] ?? data['senderId']);
    if (senderId) {
      vars['senderName'] = await this.resolveSenderName(senderId);
    } else {
      vars['senderName'] = '';
    }

    // Название сохранённого поиска.
    const searchName = this.strVal(data['saved_search_name'] ?? data['savedSearchName']);
    vars['searchName'] = searchName ?? '';

    // statusBody для LISTING_MODERATION_STATUS_CHANGED.
    if (n.type === NotificationType.LISTING_MODERATION_STATUS_CHANGED) {
      const newStatus = this.strVal(data['new_status'] ?? data['newStatus']) ?? '';
      const reason = this.strVal(data['reason']) ?? undefined;
      vars['statusBody'] = moderationStatusBody(newStatus, reason, lang);
    }

    return vars;
  }

  /**
   * Загрузить заголовок объявления на нужном языке.
   * Если перевод не найден — взять оригинальный заголовок.
   * При любой ошибке вернуть фолбэк-строку.
   */
  private async resolveListingTitle(
    listingId: string,
    lang: Language,
  ): Promise<string> {
    try {
      // Ищем перевод на нужный язык.
      const translation = await this.prisma.listingTranslation.findFirst({
        where: { listingId, language: lang },
        select: { title: true },
      });
      if (translation?.title) {
        return translation.title;
      }

      // Фолбэк: любой перевод (оригинальный язык объявления).
      const anyTranslation = await this.prisma.listingTranslation.findFirst({
        where: { listingId },
        select: { title: true },
        orderBy: { createdAt: 'asc' },
      });
      return anyTranslation?.title ?? '';
    } catch (err) {
      this.logger.warn(
        `Failed to resolve listing title for ${listingId}: ${String(err)}`,
      );
      return '';
    }
  }

  /**
   * Загрузить отображаемое имя отправителя (чат).
   * Приоритет: profile.displayName → profile.firstName → user.email → фолбэк.
   */
  private async resolveSenderName(senderId: string): Promise<string> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: senderId },
        select: {
          email: true,
          profile: { select: { displayName: true, firstName: true } },
        },
      });
      return (
        user?.profile?.displayName ??
        user?.profile?.firstName ??
        user?.email ??
        ''
      );
    } catch (err) {
      this.logger.warn(
        `Failed to resolve sender name for ${senderId}: ${String(err)}`,
      );
      return '';
    }
  }

  /** Безопасно приводит unknown к string или undefined. */
  private strVal(v: unknown): string | undefined {
    if (v === null || v === undefined) return undefined;
    return String(v);
  }
}
