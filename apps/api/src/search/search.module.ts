import { Module } from '@nestjs/common';
import { GeoModule } from '../geo';
import { TranslationsModule } from '../translations';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

/**
 * SearchModule — публичный поиск объявлений (TASK-080, M6).
 *
 * Публичный (без guards), поэтому `RolesModule` не нужен. `TranslationsModule`
 * даёт {@link TranslationsService} для выбора языка карточки (TASK-070).
 * `GeoModule` — {@link DistrictsService} для разрешения `district_name` в
 * карточках (TASK-209). Prisma — глобальный модуль, импорт не требуется.
 */
@Module({
  imports: [TranslationsModule, GeoModule],
  controllers: [SearchController],
  providers: [SearchService],
  exports: [SearchService],
})
export class SearchModule {}
