import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Результат отправки FCM multicast. */
export interface FcmSendResult {
  successCount: number;
  /** Push-токены устройств, признанных невалидными Firebase (нужно деактивировать). */
  invalidTokens: string[];
}

/**
 * FcmService — доставка push через Firebase Cloud Messaging (FCM, ADR-0102, §3.4).
 *
 * Config-gated: при отсутствии кредов (FIREBASE_PROJECT_ID/CLIENT_EMAIL/PRIVATE_KEY)
 * `isConfigured()=false`; вместо реальной отправки логирует `[DEV PUSH → ...]`
 * и возвращает нулевой результат. НИКОГДА не бросает исключение из-за отсутствия кредов.
 *
 * firebase-admin инициализируется лениво и мемоизируется — только при `isConfigured()`.
 * Реиспользует существующий App (если уже создан другим кодом) во избежание ошибки
 * «App already exists».
 *
 * Зеркалит поведение {@link EmailSender.deliver} (config-gated dev-fallback).
 */
@Injectable()
export class FcmService {
  private readonly logger = new Logger(FcmService.name);

  /** Признак того, что firebase-admin уже проинициализирован этим сервисом. */
  private appInitialized = false;

  constructor(private readonly config: ConfigService) {}

  /**
   * Возвращает true, если все три Firebase-крeда присутствуют в конфиге.
   * Без хотя бы одного — FCM недоступен.
   */
  isConfigured(): boolean {
    const projectId = this.config.get<string>('firebase.projectId');
    const clientEmail = this.config.get<string>('firebase.clientEmail');
    const privateKey = this.config.get<string>('firebase.privateKey');
    return Boolean(projectId && clientEmail && privateKey);
  }

  /**
   * Отправить push-уведомление на список FCM-токенов.
   *
   * - Не настроено → dev warn-log, `{successCount:0, invalidTokens:[]}`.
   * - Настроено → `sendEachForMulticast`; мёртвые токены собираются в `invalidTokens`.
   * - Исключения FCM пробрасываются (диспетчер пишет FAILED + retry).
   */
  async send(
    tokens: string[],
    payload: { title: string; body: string; data: Record<string, string> },
  ): Promise<FcmSendResult> {
    if (tokens.length === 0) {
      return { successCount: 0, invalidTokens: [] };
    }

    if (!this.isConfigured()) {
      const preview = tokens.slice(0, 2).join(', ') + (tokens.length > 2 ? '...' : '');
      this.logger.warn(
        `[DEV PUSH → ${preview}] ${payload.title}: ${payload.body}`,
      );
      return { successCount: 0, invalidTokens: [] };
    }

    await this.getAdminApp();

    // Используем getMessaging() из firebase-admin/messaging (отдельный sub-package).
    const { getMessaging } = await import('firebase-admin/messaging');
    const messaging = getMessaging();

    const response = await messaging.sendEachForMulticast({
      tokens,
      notification: { title: payload.title, body: payload.body },
      data: payload.data,
    });

    const invalidTokens: string[] = [];
    let successCount = 0;

    response.responses.forEach(
      (resp: { success: boolean; error?: { code?: string } }, idx: number) => {
        if (resp.success) {
          successCount++;
        } else {
          const code = resp.error?.code ?? '';
          if (
            code === 'messaging/registration-token-not-registered' ||
            code === 'messaging/invalid-registration-token'
          ) {
            invalidTokens.push(tokens[idx]);
          }
        }
      },
    );

    return { successCount, invalidTokens };
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  /**
   * Лениво инициализирует firebase-admin App.
   * При повторных вызовах реиспользует уже инициализированный App.
   */
  private async getAdminApp(): Promise<void> {
    // Динамический импорт — не грузим firebase-admin пока не нужно.
    const { getApps, initializeApp, cert } = await import('firebase-admin/app');

    const existingApps = getApps();
    if (existingApps.length > 0) {
      // Реиспользуем уже существующий App (этот сервис или сторонний код).
      this.appInitialized = true;
      return;
    }

    if (this.appInitialized) {
      // Уже инициализировали ранее.
      return;
    }

    // Первичная инициализация.
    const projectId = this.config.get<string>('firebase.projectId')!;
    const clientEmail = this.config.get<string>('firebase.clientEmail')!;
    const privateKey = this.config.get<string>('firebase.privateKey')!;

    initializeApp({
      credential: cert({ projectId, clientEmail, privateKey }),
    });

    this.appInitialized = true;
  }
}
