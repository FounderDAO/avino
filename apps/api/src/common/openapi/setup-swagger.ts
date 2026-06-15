import { INestApplication, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule } from '@nestjs/swagger';
import basicAuth from 'express-basic-auth';
import { createInternalDocument, createPublicDocument } from './swagger.documents';
import { resolveSwaggerGating, SwaggerSettings } from './swagger.gating';

/**
 * Монтирует Swagger UI и JSON по решению гейтинга:
 *  - /api/docs            публичный UI (за SWAGGER_ENABLED)
 *  - /api/docs-json       публичный raw OpenAPI
 *  - /api/docs/internal   полный UI (всегда за HTTP Basic-auth)
 *  - /api/docs/internal-json  internal raw OpenAPI
 *
 * Вызывать ПОСЛЕ setGlobalPrefix + enableVersioning, чтобы пути отрендерились
 * как /api/v1/...
 */
export function setupSwagger(app: INestApplication): void {
  const logger = new Logger('Swagger');
  const config = app.get(ConfigService);
  const settings: SwaggerSettings = {
    enabled: config.get<boolean>('swagger.enabled') ?? false,
    basicAuthUser: config.get<string>('swagger.basicAuthUser'),
    basicAuthPass: config.get<string>('swagger.basicAuthPass'),
  };
  const gating = resolveSwaggerGating(settings);

  if (!gating.mountPublic) {
    logger.log('Swagger disabled (SWAGGER_ENABLED=false) — docs not mounted');
    return;
  }

  SwaggerModule.setup('api/docs', app, createPublicDocument(app), {
    swaggerOptions: { persistAuthorization: true },
  });
  logger.log('Public API docs mounted at /api/docs (json: /api/docs-json)');

  if (gating.mountInternal && gating.basicAuth) {
    // Basic-auth ставим ДО setup, чтобы middleware перехватывал и UI, и JSON.
    // /api/docs/internal-json не покрывается префиксом /api/docs/internal,
    // поэтому перечисляем оба пути явно.
    app.use(
      ['/api/docs/internal', '/api/docs/internal-json'],
      basicAuth({
        users: { [gating.basicAuth.user]: gating.basicAuth.pass },
        challenge: true,
      }),
    );
    SwaggerModule.setup('api/docs/internal', app, createInternalDocument(app), {
      swaggerOptions: { persistAuthorization: true },
    });
    logger.log('Internal API docs mounted at /api/docs/internal (basic-auth)');
  } else {
    logger.warn(
      'Internal docs NOT mounted: set SWAGGER_USER and SWAGGER_PASS to enable',
    );
  }
}
