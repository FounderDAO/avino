import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RolesModule } from '../roles';
import { ListingAutoTranslator } from './listing-auto-translator.service';
import { createTranslationProvider } from './providers/translation-provider.factory';
import { TRANSLATION_PROVIDER } from './providers/translation-provider.interface';
import { TranslationsController } from './translations.controller';
import { TranslationsService } from './translations.service';

/**
 * TranslationsModule — хранение/выдача переводов и авто-перевод (TASK-070/071, M7).
 *
 * `RolesModule` даёт Bearer-аутентификацию ({@link JwtAuthGuard}) одним импортом
 * (TASK-044). Экспортирует {@link TranslationsService}, чтобы ListingsModule
 * делегировал ему построение авторской строки и выбор языка. Prisma — глобальный
 * модуль, импорт не нужен.
 *
 * Авто-перевод (TASK-071): провайдер ({@link TRANSLATION_PROVIDER}) выбирается по
 * `TRANSLATE_PROVIDER`, {@link ListingAutoTranslator} — бизнес-логика перевода.
 */
@Module({
  imports: [RolesModule],
  controllers: [TranslationsController],
  providers: [
    TranslationsService,
    {
      provide: TRANSLATION_PROVIDER,
      useFactory: createTranslationProvider,
      inject: [ConfigService],
    },
    ListingAutoTranslator,
  ],
  exports: [TranslationsService],
})
export class TranslationsModule {}
