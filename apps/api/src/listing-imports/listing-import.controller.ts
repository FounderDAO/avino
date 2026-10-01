import {
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UserRole } from '@avino/shared';
import { CurrentUser, Roles } from '../common/decorators';
import { JwtAuthGuard, RolesGuard } from '../common/guards';
import { RunListingImportQueryDto } from './dto/run-listing-import.dto';
import { ImportUploadedFile } from './import-file.parser';
import { ListingImportReport } from './import-report';
import { buildImportTemplate } from './import-template.builder';
import { ListingImportService } from './listing-import.service';

/**
 * ListingImportController — массовый импорт объявлений из админки
 * (спека 2026-10-02, ADR-0162, API.md §16). Только ADMIN: импорт создаёт
 * пользователей и объявления от чужого имени.
 */
@Controller({ path: 'admin/listing-imports', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class ListingImportController {
  constructor(private readonly service: ListingImportService) {}

  /**
   * `POST /api/v1/admin/listing-imports` — `multipart/form-data`, поле `file`
   * (`.xlsx`/`.csv`). `dry_run=true` — предпросмотр без записи.
   */
  @Post()
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('file'))
  run(
    @UploadedFile() file: ImportUploadedFile | undefined,
    @Query() query: RunListingImportQueryDto,
    @CurrentUser('id') actorId: string,
  ): Promise<ListingImportReport> {
    return this.service.run(file, actorId, query.dry_run ?? false);
  }

  /** `GET /api/v1/admin/listing-imports/template` — шаблон `.xlsx`. Объявлен до `:id`. */
  @Get('template')
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @Header('Content-Disposition', 'attachment; filename="avino-listing-import.xlsx"')
  async template(): Promise<StreamableFile> {
    return new StreamableFile(await buildImportTemplate());
  }

  /** `GET /api/v1/admin/listing-imports/:id` — сохранённый отчёт запуска. */
  @Get(':id')
  getReport(@Param('id', ParseUUIDPipe) id: string): Promise<ListingImportReport> {
    return this.service.getReport(id);
  }
}
