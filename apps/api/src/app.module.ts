import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AdminModule } from './admin';
import { AgentApplicationsModule } from './agent-applications';
import { AgentsModule } from './agents';
import { AmenitiesModule } from './amenities';
import { BroadcastsModule } from './broadcasts';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { ChatModule } from './chat';
import { ComplaintsModule } from './complaints';
import { AppConfigModule } from './config';
import { ConditionalThrottlerGuard } from './common/guards/conditional-throttler.guard';
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
import { RealtimeModule } from './realtime';
import { RedisModule } from './redis';
import { SavedSearchesModule } from './saved-searches';
import { SearchModule } from './search';
import { SettingsModule } from './settings';
import { SupportModule } from './support';
import { TourRequestsModule } from './tour-requests';
import { TranslationsModule } from './translations';
import { UploadsModule } from './uploads';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    // ThrottlerModule первым — ConditionalThrottlerGuard (APP_GUARD) зависит от него (M-3).
    ThrottlerModule.forRootAsync({
      imports: [AppConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            limit: config.get<number>('throttler.limit') ?? 60,
            // ThrottlerModule v6 ожидает ttl в миллисекундах.
            ttl: (config.get<number>('throttler.ttl') ?? 60) * 1000,
          },
        ],
      }),
    }),
    AppConfigModule,
    PrismaModule,
    RedisModule,
    QueuesModule,
    HealthModule,
    AuthModule,
    RealtimeModule,
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
    SupportModule,
    AdminModule,
    UploadsModule,
    MediaCleanupModule,
    TourRequestsModule,
    AgentApplicationsModule,
    AgentsModule,
    AmenitiesModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      // Глобальный throttler-гард с поддержкой THROTTLE_DISABLED (M-3).
      provide: APP_GUARD,
      useClass: ConditionalThrottlerGuard,
    },
  ],
})
export class AppModule {}
