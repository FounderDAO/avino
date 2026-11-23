import { Injectable, Logger, Optional } from '@nestjs/common';
import { ListingStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ListingUrlSyncQueue } from '../queues/listing-url-sync.queue';
import { AddressResolverService } from './address-resolver.service';

/**
 * Повторное определение района по точке объявления (SEO AUD-2).
 *
 * - геокодер недоступен (нет ключа, сеть, квота) → ошибка: BullMQ повторит;
 * - ответ есть, но район не распознан → лог `district_unresolved`, без повтора;
 * - район найден → записываем (только если его всё ещё нет), двигаем дату
 *   содержимого и синхронизируем страницу с сайтом.
 */
@Injectable()
export class GeoResolveProcessor {
  private readonly logger = new Logger(GeoResolveProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly resolver: AddressResolverService,
    @Optional() private readonly urlSync?: ListingUrlSyncQueue,
  ) {}

  async process(listingId: string, lastAttempt: boolean): Promise<void> {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: { districtId: true, latitude: true, longitude: true, status: true },
    });
    if (
      !listing ||
      listing.districtId ||
      listing.latitude == null ||
      listing.longitude == null ||
      listing.status === ListingStatus.DELETED
    ) {
      return;
    }

    const result = await this.resolver.resolveDistrictId(listing.latitude.toString(), listing.longitude.toString());
    if (result === null) {
      if (lastAttempt) this.logger.warn(`district_unresolved ${listingId}: geocoder unavailable`);
      throw new Error('Geocoder unavailable');
    }
    if (!result.districtId) {
      this.logger.warn(`district_unresolved ${listingId}: no dictionary district at the point`);
      return;
    }

    const updated = await this.prisma.listing.updateMany({
      where: { id: listingId, districtId: null },
      data: { districtId: result.districtId, contentUpdatedAt: new Date() },
    });
    if (updated.count > 0) {
      await this.urlSync?.enqueue([listingId]);
    }
  }
}
