import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UnrecoverableError } from 'bullmq';

/**
 * Вызов сайта после изменения объявления (SEO AUD-11, контракт A):
 * `POST {SEO_SYNC_URL}` с `Authorization: Bearer {SEO_SYNC_SECRET}` и
 * `{ "listing_ids": [id] }`. Сайт сбрасывает кэш страниц и шлёт URL в IndexNow.
 *
 * 5xx и сетевые ошибки бросаются — BullMQ повторит с backoff. 4xx (неверный
 * секрет, тело) повтор не исправит: UnrecoverableError, запись в лог.
 */
@Injectable()
export class SeoSyncProcessor {
  private readonly logger = new Logger(SeoSyncProcessor.name);

  constructor(
    private readonly config: ConfigService,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async process(listingId: string): Promise<void> {
    const url = this.config.get<string>('seoSync.url');
    const secret = this.config.get<string>('seoSync.secret') ?? '';
    if (!url) return;

    const res = await this.fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
      body: JSON.stringify({ listing_ids: [listingId] }),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) {
      this.logger.log(`SEO sync ${listingId} → ${res.status}`);
      return;
    }
    if (res.status >= 400 && res.status < 500) {
      this.logger.error(`SEO sync ${listingId} rejected by site: ${res.status}`);
      throw new UnrecoverableError(`SEO sync rejected: ${res.status}`);
    }
    throw new Error(`SEO sync failed: ${res.status}`);
  }
}
