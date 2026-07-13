import { Module } from '@nestjs/common';
import { AddressResolverService } from './address-resolver.service';
import { DistrictsService } from './districts.service';
import { GeoController } from './geo.controller';
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
  providers: [AddressResolverService, DistrictsService, RegionsService],
  exports: [AddressResolverService, DistrictsService, RegionsService],
})
export class GeoModule {}
