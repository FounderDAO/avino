import { Module } from '@nestjs/common';
import { AdminModule } from './admin';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { AppConfigModule } from './config';
import { HealthModule } from './health/health.module';
import { ListingsModule } from './listings/listings.module';
import { PrismaModule } from './prisma';
import { RedisModule } from './redis';
import { UploadsModule } from './uploads';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    RedisModule,
    HealthModule,
    AuthModule,
    UsersModule,
    ListingsModule,
    AdminModule,
    UploadsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
