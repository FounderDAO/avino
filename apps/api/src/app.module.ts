import { Module } from '@nestjs/common';
import { AdminModule } from './admin';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { ChatModule } from './chat';
import { AppConfigModule } from './config';
import { FavoritesModule } from './favorites';
import { HealthModule } from './health/health.module';
import { ListingMediaModule } from './listing-media';
import { ListingsModule } from './listings/listings.module';
import { NotificationsModule } from './notifications';
import { PrismaModule } from './prisma';
import { PromotionsModule } from './promotions';
import { QueuesModule } from './queues';
import { RedisModule } from './redis';
import { SavedSearchesModule } from './saved-searches';
import { SearchModule } from './search';
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
    FavoritesModule,
    SavedSearchesModule,
    PromotionsModule,
    NotificationsModule,
    ChatModule,
    AdminModule,
    UploadsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
