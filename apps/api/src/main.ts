import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { RequestIdInterceptor } from './common/interceptors/request-id.interceptor';
import { validationPipeOptions } from './common/validation/validation.options';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // API versioning обязателен с первого дня (CLAUDE.md §14): /api/v1/...
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  // request_id для каждого запроса + заголовок X-Request-Id (TASK-023).
  app.useGlobalInterceptors(new RequestIdInterceptor());
  // Глобальная валидация входных DTO: whitelist + transform (TASK-022).
  app.useGlobalPipes(new ValidationPipe(validationPipeOptions));
  // Единый error-envelope на всех эндпоинтах (TASK-023, docs/API.md §4).
  app.useGlobalFilters(new AllExceptionsFilter());
  const config = app.get(ConfigService);
  const port = config.get<number>('app.port') ?? 4000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`Avino API listening on http://localhost:${port}/api/v1`);
}

bootstrap();
