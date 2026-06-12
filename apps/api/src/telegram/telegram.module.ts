import { Module } from '@nestjs/common';
import { TelegramService } from './telegram.service';

/**
 * TelegramModule — admin-алерты. PrismaModule и ConfigModule глобальные, поэтому
 * imports не нужны. Экспортирует TelegramService для AuthModule (хуки алертов).
 */
@Module({
  providers: [TelegramService],
  exports: [TelegramService],
})
export class TelegramModule {}
