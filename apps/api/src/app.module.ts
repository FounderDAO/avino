import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AppConfigModule } from './config';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma';

@Module({
  imports: [AppConfigModule, PrismaModule, HealthModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
