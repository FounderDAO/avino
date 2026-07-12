// Sentry ДОЛЖЕН инициализироваться до Nest/express (ADR-0129) — не переносить ниже.
import './instrument';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { buildCorsOptions } from './common/cors/cors.options';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { setupSwagger } from './common/openapi';
import { RequestIdInterceptor } from './common/interceptors/request-id.interceptor';
import { validationPipeOptions } from './common/validation/validation.options';
import { RedisIoAdapter } from './realtime';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Доверяем одному доверенному прокси-хопу (nginx/Cloudflare).
  // Без этого req.ip == IP прокси, а не клиента → per-IP rate-limit бесполезен (M-1).
  app.set('trust proxy', 1);
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
  // CORS для браузерных клиентов (apps/web): origin-allowlist из ENV (TASK-024,
  // ARCHITECTURE §24). Без этого RTK Query из браузера не может ходить в API.
  app.enableCors(buildCorsOptions(config.get<string[]>('cors.origins') ?? []));
  // HTTP security headers (M-2). Swagger UI needs a relaxed CSP for inline scripts.
  // Tight policy globally; Swagger paths override via a per-path middleware.
  app.use(
    helmet({
      // HSTS: 1 year + subdomains (nginx/CF should also enforce at the edge).
      hsts: { maxAge: 31536000, includeSubDomains: true },
      // Prevents MIME sniffing.
      noSniff: true,
      // Disallow framing entirely.
      frameguard: { action: 'deny' },
      // Don't send Referer header across origins.
      referrerPolicy: { policy: 'no-referrer' },
      // CSP: strict for API JSON responses; Swagger UI overrides below.
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
          imgSrc: ["'self'", 'data:'],
        },
      },
    }),
  );
  // Swagger UI CSP override: allow inline scripts/styles (required by Swagger UI).
  app.use(
    ['/api/docs', '/api/docs-internal'],
    (req: unknown, res: { setHeader: (k: string, v: string) => void }, next: () => void) => {
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:;",
      );
      next();
    },
  );
  // Swagger/OpenAPI: смонтировать после префикса/версионирования.
  setupSwagger(app);
  // Redis-backed socket.io adapter: emit долетает до всех инстансов (spec real-time).
  const redisIoAdapter = new RedisIoAdapter(app);
  await redisIoAdapter.connectToRedis();
  app.useWebSocketAdapter(redisIoAdapter);
  const port = config.get<number>('app.port') ?? 4000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`Avino API listening on http://localhost:${port}/api/v1`);
}

bootstrap();
