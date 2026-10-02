import { Module } from '@nestjs/common';
import { ListingsModule } from '../listings/listings.module';
import { RolesModule } from '../roles';
import { ListingImportController } from './listing-import.controller';
import { ListingImportLock } from './listing-import.lock';
import { ListingImportService } from './listing-import.service';

/**
 * ListingImportsModule — массовый импорт объявлений (спека 2026-10-02).
 * `RolesModule` — Bearer + роли; `ListingsModule` — общая с обычным созданием
 * запись объявления ({@link ListingsService.createInTransaction}). Prisma и
 * Redis — глобальные модули.
 */
@Module({
  imports: [RolesModule, ListingsModule],
  controllers: [ListingImportController],
  providers: [ListingImportService, ListingImportLock],
})
export class ListingImportsModule {}
