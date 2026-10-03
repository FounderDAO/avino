import {
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
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
import { ListListingImportsQueryDto } from './dto/list-listing-imports.dto';
import { ImportPhotoReport, ImportPhotosSummary, ListingImportListItem, ListingImportReport } from './import-report';
import { buildImportTemplate } from './import-template.builder';
import { ListingImportPhotosService } from './listing-import-photos.service';
import { ListingImportService } from './listing-import.service';

/** Жёсткий потолок памяти для multipart; бизнес-лимит 10 МиБ — в сервисе (свой код ошибки). */
const PHOTO_UPLOAD_HARD_LIMIT = 20 * 1024 * 1024;

/**
 * ListingImportController — массовый импорт объявлений из админки
 * (спека 2026-10-02, ADR-0162, API.md §16). Только ADMIN: импорт создаёт
 * пользователей и объявления от чужого имени.
 */
@Controller({ path: 'admin/listing-imports', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class ListingImportController {
  constructor(
    private readonly service: ListingImportService,
    private readonly photos: ListingImportPhotosService,
  ) {}

  /** `GET /api/v1/admin/listing-imports` — история импортов, новые сверху. */
  @Get()
  list(@Query() query: ListListingImportsQueryDto): Promise<{ data: ListingImportListItem[]; meta: { page: number; limit: number; total: number } }> {
    return this.service.list(query.page ?? 1, query.limit ?? 20);
  }

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

  /** `GET /api/v1/admin/listing-imports/:id/photos/summary` — счётчики фото для опроса. */
  @Get(':id/photos/summary')
  photoSummary(@Param('id', ParseUUIDPipe) id: string): Promise<ImportPhotosSummary> {
    return this.photos.summary(id);
  }

  /** `PUT /api/v1/admin/listing-imports/:id/photos/:photoId` — загрузка фото из папки, поле `file`. */
  @Put(':id/photos/:photoId')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: PHOTO_UPLOAD_HARD_LIMIT } }))
  uploadPhoto(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('photoId', ParseUUIDPipe) photoId: string,
    @UploadedFile() file: ImportUploadedFile | undefined,
  ): Promise<ImportPhotoReport> {
    return this.photos.upload(id, photoId, file);
  }

  /** `POST /api/v1/admin/listing-imports/:id/photos/retry` — повтор ссылок. */
  @Post(':id/photos/retry')
  @HttpCode(200)
  retryPhotos(@Param('id', ParseUUIDPipe) id: string): Promise<{ queued: number }> {
    return this.photos.retry(id);
  }
}
