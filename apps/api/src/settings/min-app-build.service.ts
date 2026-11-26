import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma';
import {
  MIN_APP_BUILD_ANDROID_KEY,
  MIN_APP_BUILD_IOS_KEY,
  resolveMinAppBuild,
} from './min-app-build.constants';

/** Минимальные допустимые сборки мобильного приложения по платформам. */
export interface MinAppBuild {
  ios: number;
  android: number;
}

/**
 * Runtime-настройка «обязательного обновления» мобильного приложения. Хранит
 * два целых строками в app_settings (min_app_build_ios, min_app_build_android);
 * читается публичным PublicSettingsController, меняется admin-контроллером без
 * пересборки. Приложение со сборкой ниже значения показывает экран
 * обязательного обновления. `0` = не требовать (дефолт). Зеркалит
 * {@link ActiveListingLimitService}.
 *
 * Отдельного env-дефолта нет: он всегда `0`, а DB-ошибка тоже даёт `0` —
 * сбой БД никогда не должен заблокировать пользователей.
 */
@Injectable()
export class MinAppBuildService {
  constructor(private readonly prisma: PrismaService) {}

  /** Текущие минимальные сборки. DB-ошибка → 0 (не блокируем). */
  async get(): Promise<MinAppBuild> {
    return {
      ios: await this.read(MIN_APP_BUILD_IOS_KEY),
      android: await this.read(MIN_APP_BUILD_ANDROID_KEY),
    };
  }

  /**
   * Задать минимальные сборки (ADMIN). Пишет только переданные поля в
   * app_settings + одну строку audit-log с новыми значениями.
   */
  async set(
    adminId: string,
    patch: Partial<MinAppBuild>,
  ): Promise<MinAppBuild> {
    const metadata: Partial<MinAppBuild> = {};
    if (patch.ios !== undefined) {
      await this.write(MIN_APP_BUILD_IOS_KEY, patch.ios);
      metadata.ios = patch.ios;
    }
    if (patch.android !== undefined) {
      await this.write(MIN_APP_BUILD_ANDROID_KEY, patch.android);
      metadata.android = patch.android;
    }
    await this.prisma.auditLog.create({
      data: {
        actorId: adminId,
        action: 'MIN_APP_BUILD_UPDATE',
        entityType: 'app_setting',
        entityId: null,
        metadata,
      },
    });
    return this.get();
  }

  private async read(key: string): Promise<number> {
    try {
      const row = await this.prisma.appSetting.findUnique({ where: { key } });
      return resolveMinAppBuild(row?.value);
    } catch {
      return 0;
    }
  }

  private async write(key: string, build: number): Promise<void> {
    const value = String(build);
    await this.prisma.appSetting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
  }
}
