import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { AuthModule } from '../../auth/auth.module';
import { ChatModule } from '../../chat';
import { ComplaintsModule } from '../../complaints';
import { FavoritesModule } from '../../favorites';
import { GeoModule } from '../../geo';
import { HealthModule } from '../../health/health.module';
import { ListingMediaModule } from '../../listing-media';
import { ListingsModule } from '../../listings/listings.module';
import { NotificationsModule } from '../../notifications';
import { PromotionsModule } from '../../promotions';
import { SavedSearchesModule } from '../../saved-searches';
import { SearchModule } from '../../search';
import { TranslationsModule } from '../../translations';
import { UsersModule } from '../../users/users.module';
import {
  ErrorBodyDto,
  ErrorDetailDto,
  ErrorResponseDto,
} from './error-response.swagger';

/** Имя bearer-схемы безопасности в OpenAPI (используется в "Authorize"). */
export const BEARER_SCHEME_NAME = 'bearer';

/** Модули, контроллеры которых попадают в ПУБЛИЧНЫЙ документ (без admin/*). */
export const PUBLIC_MODULES = [
  AuthModule,
  UsersModule,
  TranslationsModule,
  ListingsModule,
  ListingMediaModule,
  SearchModule,
  GeoModule,
  FavoritesModule,
  SavedSearchesModule,
  PromotionsModule,
  NotificationsModule,
  ChatModule,
  ComplaintsModule,
  HealthModule,
];

/**
 * Явный allowlist путей публичного документа. Belt-and-suspenders поверх
 * module-include: даже если Swagger подтянет контроллер импортированного модуля
 * (напр. RolesController через RolesModule), путь будет отброшен.
 * Все админ-роуты живут под /api/v1/admin/*, roles — под /api/v1/roles.
 */
export const PUBLIC_PATH_PREFIXES = [
  '/api/v1/auth',
  '/api/v1/users',
  '/api/v1/translations',
  '/api/v1/listings', // покрывает и /listings/{id}/media
  '/api/v1/search',
  '/api/v1/geo',
  '/api/v1/favorites',
  '/api/v1/saved-searches',
  '/api/v1/promotions',
  '/api/v1/notifications',
  '/api/v1/chat',
  '/api/v1/complaints',
  '/api/v1/health',
];

/** Базовая конфигурация документа (заголовок, версия, bearer-схема). */
export function buildBaseConfig() {
  return new DocumentBuilder()
    .setTitle('Avino API')
    .setDescription(
      'API портала недвижимости Avino. Аутентификация: ' +
        'POST /auth/otp/request → /auth/otp/verify → { accessToken, refreshToken }; ' +
        'обновление — /auth/refresh; вход через Google — /auth/google. ' +
        'Bearer-токен передаётся в заголовке Authorization.',
    )
    .setVersion('1')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', in: 'header' },
      BEARER_SCHEME_NAME,
    )
    .build();
}

/** Возвращает копию документа только с путями, разрешёнными allowlist'ом. */
export function prunePublicPaths(
  doc: OpenAPIObject,
  allowedPrefixes: string[],
): OpenAPIObject {
  const paths = doc.paths ?? {};
  const filtered: OpenAPIObject['paths'] = {};
  for (const [route, item] of Object.entries(paths)) {
    if (allowedPrefixes.some((prefix) => route.startsWith(prefix))) {
      filtered[route] = item;
    }
  }
  return { ...doc, paths: filtered };
}

const EXTRA_MODELS = [ErrorResponseDto, ErrorBodyDto, ErrorDetailDto];

/** Публичный документ: include публичных модулей + жёсткий prune по allowlist. */
export function createPublicDocument(app: INestApplication): OpenAPIObject {
  const doc = SwaggerModule.createDocument(app, buildBaseConfig(), {
    include: PUBLIC_MODULES,
    extraModels: EXTRA_MODELS,
  });
  return prunePublicPaths(doc, PUBLIC_PATH_PREFIXES);
}

/** Internal-документ: все контроллеры, включая admin/*. */
export function createInternalDocument(app: INestApplication): OpenAPIObject {
  return SwaggerModule.createDocument(app, buildBaseConfig(), {
    extraModels: EXTRA_MODELS,
  });
}
