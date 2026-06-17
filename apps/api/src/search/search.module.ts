import { Module } from '@nestjs/common';
import { GeoModule } from '../geo';
import { TranslationsModule } from '../translations';
import { UploadsModule } from '../uploads';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

/**
 * SearchModule — публичный поиск объявлений (TASK-080, M6).
 *
 * Публичный (без guards), поэтому `RolesModule` не нужен. `TranslationsModule`
 * даёт {@link TranslationsService} для выбора языка карточки (TASK-070).
 * `GeoModule` — {@link DistrictsService} для разрешения `district_name` в
 * карточках (TASK-209). `UploadsModule` — {@link UploadsService} для свежей
 * presigned-подписи обложки на чтении (ADR-0086). Prisma — глобальный модуль.
 */
@Module({
  imports: [TranslationsModule, GeoModule, UploadsModule],
  controllers: [SearchController],
  providers: [SearchService],
  exports: [SearchService],
})
export class SearchModule {}
