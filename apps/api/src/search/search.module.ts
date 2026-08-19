import { Module } from '@nestjs/common';
import { GeoModule } from '../geo';
import { RolesModule } from '../roles';
import { TranslationsModule } from '../translations';
import { UploadsModule } from '../uploads';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

/**
 * SearchModule — публичный поиск объявлений (TASK-080, M6).
 *
 * Раньше был публичным без guards; теперь принимает опциональный Bearer
 * (`OptionalJwtAuthGuard`, TASK-051) ради фильтра блокировок (Apple Guideline
 * 1.2, спека 2026-08-19) — авторизованный зритель не должен видеть в выдаче/
 * карте объявления заблокированных им авторов ({@link
 * SearchService.buildWhereSql}). `RolesModule` экспортирует
 * `OptionalJwtAuthGuard` и `JwtModule`. `TranslationsModule` даёт
 * {@link TranslationsService} для выбора языка карточки (TASK-070).
 * `GeoModule` — {@link DistrictsService} для разрешения `district_name` в
 * карточках (TASK-209). `UploadsModule` — {@link UploadsService} для свежей
 * presigned-подписи обложки на чтении (ADR-0086). Prisma — глобальный модуль.
 */
@Module({
  imports: [RolesModule, TranslationsModule, GeoModule, UploadsModule],
  controllers: [SearchController],
  providers: [SearchService],
  exports: [SearchService],
})
export class SearchModule {}
