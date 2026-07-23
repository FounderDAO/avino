import { Module } from '@nestjs/common';
import { UploadsModule } from '../uploads';
import { AgentsController } from './agents.controller';
import { AgentsService } from './agents.service';

/** AgentsModule — публичный каталог агентов (ADR-0140, API.md §21). */
@Module({
  imports: [UploadsModule],
  controllers: [AgentsController],
  providers: [AgentsService],
  exports: [AgentsService],
})
export class AgentsModule {}
