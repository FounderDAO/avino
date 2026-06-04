import { Module } from '@nestjs/common';
import { RolesModule } from '../roles';
import { SearchModule } from '../search';
import { FavoritesController } from './favorites.controller';
import { FavoritesService } from './favorites.service';

/**
 * FavoritesModule — избранные объявления (TASK-090, M6).
 *
 * `RolesModule` даёт Bearer-аутентификацию ({@link JwtAuthGuard}) одним импортом
 * (TASK-044); `SearchModule` — {@link SearchService.cardsByIds} для карточек
 * списка «как в /search» (API.md §11). Prisma — глобальный модуль, импорт не нужен.
 */
@Module({
  imports: [RolesModule, SearchModule],
  controllers: [FavoritesController],
  providers: [FavoritesService],
  exports: [FavoritesService],
})
export class FavoritesModule {}
