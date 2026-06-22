import { Module } from '@nestjs/common';
import { AdminModule } from './admin';
import { BroadcastsModule } from './broadcasts';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { ChatModule } from './chat';
import { ComplaintsModule } from './complaints';
import { AppConfigModule } from './config';
import { ExchangeRateModule } from './exchange-rates/exchange-rate.module';
import { FavoritesModule } from './favorites';
import { GeoModule } from './geo';
import { HealthModule } from './health/health.module';
import { ListingMediaModule } from './listing-media';
import { ListingsModule } from './listings/listings.module';
import { MediaCleanupModule } from './media-cleanup/media-cleanup.module';
import { NotificationsModule } from './notifications';
import { PrismaModule } from './prisma';
import { PromotionsModule } from './promotions';
import { QueuesModule } from './queues';
import { RedisModule } from './redis';
import { SavedSearchesModule } from './saved-searches';
import { SearchModule } from './search';
import { SettingsModule } from './settings';
import { TourRequestsModule } from './tour-requests';
import { TranslationsModule } from './translations';
import { UploadsModule } from './uploads';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    RedisModule,
    QueuesModule,
    HealthModule,
    AuthModule,
    UsersModule,
    TranslationsModule,
    ListingsModule,
    ListingMediaModule,
    SearchModule,
    SettingsModule,
    GeoModule,
    FavoritesModule,
    SavedSearchesModule,
    PromotionsModule,
    ExchangeRateModule,
    NotificationsModule,
    BroadcastsModule,
    ChatModule,
    ComplaintsModule,
    AdminModule,
    UploadsModule,
    MediaCleanupModule,
    TourRequestsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
