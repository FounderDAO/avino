import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings';
import { LegalDocumentsController } from './legal-documents.controller';
import { LegalDocumentsService } from './legal-documents.service';

/**
 * LegalDocumentsModule — версионируемые юр-документы. Владеет
 * {@link LegalDocumentsService} и {@link LegalDocumentsController}; публичный контроллер
 * обслуживает GET /api/v1/legal/:kind, admin-контроллер живёт в AdminModule (Task 5).
 * SettingsModule — ради LegalConsentFlagService (бамп версии согласия при публикации).
 */
@Module({
  imports: [SettingsModule],
  controllers: [LegalDocumentsController],
  providers: [LegalDocumentsService],
  exports: [LegalDocumentsService],
})
export class LegalDocumentsModule {}
