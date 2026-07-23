import { Module } from '@nestjs/common';
import { AmenitiesController } from './amenities.controller';
import { AmenitiesService } from './amenities.service';

/**
 * AmenitiesModule — справочник удобств. Владеет {@link AmenitiesService} и
 * публичным `GET /amenities`. Сервис экспортируется для {@link
 * AdminAmenitiesController} (в AdminModule) и валидации в ListingsService.
 */
@Module({
  controllers: [AmenitiesController],
  providers: [AmenitiesService],
  exports: [AmenitiesService],
})
export class AmenitiesModule {}
