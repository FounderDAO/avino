import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators';
import type { AuthenticatedUser } from '../common/guards';
import { JwtAuthGuard } from '../common/guards';
import { ListNotificationsQueryDto } from './dto/list-notifications.dto';
import { RegisterDeviceDto } from './dto/register-device.dto';
import {
  DeviceResponse,
  NotificationListResponse,
  NotificationsService,
} from './notifications.service';

/**
 * NotificationsController — in-app лента уведомлений (TASK-100, API.md §14).
 *
 * Все эндпоинты под `JwtAuthGuard` (класс-уровень): `GUEST` без Bearer → `401`
 * (CLAUDE.md §11). Версионирование URI обязательно (CLAUDE.md §14); префикс `api`
 * ставит main.ts → `/api/v1/notifications`. Владение enforced в сервисе по
 * `user_id`. Отметки прочтения — `POST` per API.md §14 (карточка TASK-100 пишет
 * `PATCH`, но API.md авторитетен по формулировке маршрутов — ADR-0036).
 */
@Controller({ path: 'notifications', version: '1' })
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  /** `GET /api/v1/notifications` — лента пользователя (keyset, свежие сверху). */
  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListNotificationsQueryDto,
  ): Promise<NotificationListResponse> {
    return this.notificationsService.list(user, query);
  }

  /**
   * `POST /api/v1/notifications/read-all` — отметить все прочитанными. → `204`.
   * Объявлен до `:id/read`, чтобы статический сегмент не перехватывался `:id`.
   */
  @Post('read-all')
  @HttpCode(204)
  readAll(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    return this.notificationsService.markAllRead(user);
  }

  /**
   * `POST /api/v1/notifications/devices` — регистрация push-устройства (stub,
   * ADR-0010). Body: `{ "platform": "ANDROID", "push_token": "..." }`.
   * Идемпотентно по `push_token` (upsert/claim) → `201 { id, platform, is_active }`.
   * Объявлен до `:id/read`, чтобы статический сегмент не перехватывался `:id`.
   */
  @Post('devices')
  registerDevice(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RegisterDeviceDto,
  ): Promise<DeviceResponse> {
    return this.notificationsService.registerDevice(
      user,
      dto.platform,
      dto.push_token,
    );
  }

  /**
   * `DELETE /api/v1/notifications/devices/:id` — отвязать своё устройство
   * (hard delete). → `204`. Чужое/несуществующее → `404`.
   */
  @Delete('devices/:id')
  @HttpCode(204)
  removeDevice(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.notificationsService.removeDevice(user, id);
  }

  /**
   * `POST /api/v1/notifications/:id/read` — отметить своё уведомление
   * прочитанным. → `204`. Чужое/несуществующее → `404`.
   */
  @Post(':id/read')
  @HttpCode(204)
  read(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.notificationsService.markRead(user, id);
  }
}
