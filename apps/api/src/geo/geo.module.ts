import { Module } from '@nestjs/common';
import { DistrictsService } from './districts.service';
import { GeoController } from './geo.controller';
import { RegionsService } from './regions.service';

/**
 * GeoModule — гео-справочники (TASK-209, ADR-0068; ADR-0113 regions).
 *
 * Предоставляет {@link DistrictsService} и {@link RegionsService} как export —
 * SearchModule и ListingsModule импортируют GeoModule для доступа к batch-разрешению
 * имён районов. PrismaService доступен глобально — отдельный импорт не нужен.
 */
@Module({
  controllers: [GeoController],
  providers: [DistrictsService, RegionsService],
  exports: [DistrictsService, RegionsService],
})
export class GeoModule {}
