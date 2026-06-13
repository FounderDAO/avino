import { Module } from '@nestjs/common';
import { DistrictsService } from './districts.service';
import { GeoController } from './geo.controller';

/**
 * GeoModule — гео-справочники (TASK-209, ADR-0068).
 *
 * Предоставляет {@link DistrictsService} как export — SearchModule и ListingsModule
 * импортируют GeoModule для доступа к batch-разрешению имён районов. PrismaService
 * доступен глобально — отдельный импорт не нужен.
 */
@Module({
  controllers: [GeoController],
  providers: [DistrictsService],
  exports: [DistrictsService],
})
export class GeoModule {}
