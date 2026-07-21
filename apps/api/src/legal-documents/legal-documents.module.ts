import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings';
import { LegalDocumentsController } from './legal-documents.controller';
import { LegalDocumentsService } from './legal-documents.service';

/**
 * LegalDocumentsModule — версионируемые юр-документы. Владеет
 * {@link LegalDocumentsService}; публичный контроллер добавляется в Task 4,
 * admin-контроллер живёт в AdminModule (Task 5). SettingsModule — ради
 * LegalConsentFlagService (бамп версии согласия при публикации).
 */
@Module({
  imports: [SettingsModule],
  controllers: [LegalDocumentsController],
  providers: [LegalDocumentsService],
  exports: [LegalDocumentsService],
})
export class LegalDocumentsModule {}
