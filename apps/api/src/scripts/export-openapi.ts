import { VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { AppModule } from '../app.module';
import { createInternalDocument, createPublicDocument } from '../common/openapi';

/**
 * Standalone-генератор OpenAPI. Использует preview-режим NestFactory:
 * граф модулей строится БЕЗ инстанцирования провайдеров и lifecycle-хуков,
 * поэтому не открывает соединений с PostgreSQL/Redis. Требует лишь, чтобы
 * обязательные env-переменные были ЗАДАНЫ (живая БД не нужна).
 *
 * Пишет apps/api/openapi.public.json и openapi.internal.json. Запуск:
 *   pnpm --filter @avino/api openapi:export
 */
async function exportOpenapi(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    preview: true,
    logger: false,
  });
  // Те же префикс/версионирование, что и в main.ts — иначе пути разойдутся.
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  const publicDoc = createPublicDocument(app);
  const internalDoc = createInternalDocument(app);

  // __dirname в сборке = apps/api/dist/scripts → два уровня вверх = apps/api.
  const apiRoot = join(__dirname, '..', '..');
  writeFileSync(
    join(apiRoot, 'openapi.public.json'),
    JSON.stringify(publicDoc, null, 2) + '\n',
  );
  writeFileSync(
    join(apiRoot, 'openapi.internal.json'),
    JSON.stringify(internalDoc, null, 2) + '\n',
  );

  await app.close();
  // eslint-disable-next-line no-console
  console.log('OpenAPI specs written: openapi.public.json, openapi.internal.json');
}

exportOpenapi().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
