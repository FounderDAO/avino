import { Module } from '@nestjs/common';
import { AddressResolverService } from './address-resolver.service';
import { DistrictsService } from './districts.service';
import { GeoController } from './geo.controller';
import { GeoResolveProcessor } from './geo-resolve.processor';
import { GeoResolveWorker } from './geo-resolve.worker';
import { RegionsService } from './regions.service';

/**
 * GeoModule — гео-справочники (TASK-209, ADR-0068; ADR-0113 regions).
 *
 * Предоставляет {@link DistrictsService}, {@link RegionsService} и {@link AddressResolverService}
 * как export — SearchModule и ListingsModule импортируют GeoModule для доступа к batch-разрешению
 * имён районов и реверс-геокодированию. PrismaService доступен глобально — отдельный импорт не нужен.
 */
@Module({
  controllers: [GeoController],
  // GeoResolve*: повторное определение района по точке (SEO AUD-2).
  providers: [AddressResolverService, DistrictsService, RegionsService, GeoResolveProcessor, GeoResolveWorker],
  exports: [AddressResolverService, DistrictsService, RegionsService],
})
export class GeoModule {}
