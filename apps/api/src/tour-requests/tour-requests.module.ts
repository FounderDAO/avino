import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma';
import { NotificationsModule } from '../notifications/notifications.module';
import { TourRequestsController } from './tour-requests.controller';
import { TourRequestsService } from './tour-requests.service';

@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [TourRequestsController],
  providers: [TourRequestsService],
})
export class TourRequestsModule {}
