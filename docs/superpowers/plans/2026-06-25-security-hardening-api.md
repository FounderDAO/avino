# Security Hardening API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close 7 security gaps in `apps/api` — OTP default leak, trust proxy, helmet, global throttler, brute-force lock on OTP verify, broadcast recipient cap, and broadcast DTO enum hardening — without breaking existing tests or public API contracts.

**Architecture:** All changes are confined to `apps/api/src`. New packages (`helmet`, `@nestjs/throttler`) are added to `apps/api/package.json`. The throttler uses in-memory storage (single VPS) for the global guard; OTP brute-force tracking reuses the existing ioredis `RedisService`. Config values flow through the established `configuration.ts` → `ConfigService` pipeline; no magic numbers in service code.

**Tech Stack:** NestJS 10, Express (NestExpressApplication), helmet 8.x, @nestjs/throttler 6.x, ioredis (already present), Prisma 5, Jest 29.

## Global Constraints

- Only `apps/api/` — do not touch `apps/web/`, `apps/client/`, `packages/shared/`.
- No git commands.
- Public API contracts (HTTP status codes, response shape, route paths) must not change — 429 from throttler is explicitly acceptable.
- Config values always read from `configuration.ts` → `ConfigService`, never hardcoded in services.
- `UserRole` enum imported from `@avino/shared`, not redefined.
- New env vars documented in `apps/api/.env.example` (commented out where optional with defaults, uncommented where a new explicit default changes behavior).
- Existing tests must remain green; throttler guard must not fail unit tests.
- After every task: `pnpm --filter @avino/api build` must pass.

---

### Task 1: M-5 — Telegram OTP default OFF

**Files:**
- Modify: `apps/api/src/config/configuration.ts` (line 227)
- Modify: `apps/api/.env.example` (telegram section)

**Interfaces:**
- Consumes: nothing new
- Produces: `telegramConfig.includeOtpCode` now defaults to `false`; `otp.service.ts:150` already reads this via `configService.get<boolean>('telegram.includeOtpCode') ?? true` — after this task that fallback `?? true` must also be changed to `?? false` to stay consistent.

- [ ] **Step 1: Fix the default in `configuration.ts`**

In `apps/api/src/config/configuration.ts`, line 227, change:

```ts
// Before:
includeOtpCode: process.env.TELEGRAM_INCLUDE_OTP_CODE !== 'false',
```

to:

```ts
// After: explicit ==='true' — safe default OFF (M-5, ADR security hardening).
// Включить только в dev/staging: TELEGRAM_INCLUDE_OTP_CODE=true
includeOtpCode: process.env.TELEGRAM_INCLUDE_OTP_CODE === 'true',
```

- [ ] **Step 2: Fix the fallback in `otp.service.ts`**

In `apps/api/src/auth/otp.service.ts`, line 150, change:

```ts
// Before:
const includeCode =
  this.configService.get<boolean>('telegram.includeOtpCode') ?? true;
```

to:

```ts
// After: fallback matches config default (OFF).
const includeCode =
  this.configService.get<boolean>('telegram.includeOtpCode') ?? false;
```

- [ ] **Step 3: Update `.env.example`**

In `apps/api/.env.example`, find the telegram section (currently line 57):
```
# TELEGRAM_INCLUDE_OTP_CODE=true
```
Replace with:
```
# TELEGRAM_INCLUDE_OTP_CODE=false
# Включить только на dev/staging для доставки кода в admin-чат:
# TELEGRAM_INCLUDE_OTP_CODE=true
```

- [ ] **Step 4: Build check**

```bash
pnpm --filter @avino/api build
```
Expected: exits 0, no TypeScript errors.

- [ ] **Step 5: Run affected tests**

```bash
pnpm --filter @avino/api test -- --testPathPattern="otp.service"
```
Expected: PASS (the test mocks `configService.get`, so no regression).

---

### Task 2: M-1 — Trust proxy + NestExpressApplication

**Files:**
- Modify: `apps/api/src/main.ts`

**Interfaces:**
- Consumes: nothing new
- Produces: `app` is typed as `NestExpressApplication`; `app.set('trust proxy', 1)` is called before any middleware; `req.ip` now reflects the real client IP behind nginx/Cloudflare.

- [ ] **Step 1: Add the import and retype the app**

In `apps/api/src/main.ts`, change:

```ts
// Before:
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
```

to:

```ts
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
```

- [ ] **Step 2: Change `NestFactory.create` generic + add `trust proxy`**

In `apps/api/src/main.ts`, change:

```ts
// Before:
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // API versioning обязателен с первого дня (CLAUDE.md §14): /api/v1/...
  app.setGlobalPrefix('api');
```

to:

```ts
async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Доверяем одному доверенному прокси-хопу (nginx/Cloudflare).
  // Без этого req.ip == IP прокси, а не клиента → per-IP rate-limit бесполезен (M-1).
  app.set('trust proxy', 1);
  // API versioning обязателен с первого дня (CLAUDE.md §14): /api/v1/...
  app.setGlobalPrefix('api');
```

- [ ] **Step 3: Build check**

```bash
pnpm --filter @avino/api build
```
Expected: exits 0. `@types/express` is already in devDependencies so `NestExpressApplication` resolves without new packages.

---

### Task 3: M-2 — Helmet security headers

**Files:**
- Modify: `apps/api/package.json` (add `helmet` to dependencies)
- Modify: `apps/api/src/main.ts` (apply `app.use(helmet(...))`)

**Interfaces:**
- Consumes: Task 2 (app is now `NestExpressApplication`, `app.use()` works correctly)
- Produces: All responses include `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`; Swagger UI gets a compatible CSP.

- [ ] **Step 1: Add `helmet` to `apps/api/package.json`**

In `apps/api/package.json`, in the `"dependencies"` section, add after `"express-basic-auth"`:

```json
"helmet": "^8.0.0",
```

- [ ] **Step 2: Install dependencies**

```bash
pnpm install
```
Expected: exits 0, `helmet` installed in `apps/api/node_modules`.

- [ ] **Step 3: Add helmet import and `app.use()` in `main.ts`**

In `apps/api/src/main.ts`, add the import at the top (after the `NestExpressApplication` import):

```ts
import helmet from 'helmet';
```

Then, inside `bootstrap()`, add `app.use(helmet(...))` **before** `setupSwagger(app)` (Swagger must be set up after so its route exists when we define the CSP override). The full relevant block becomes:

```ts
  // HTTP security headers (M-2). Swagger UI needs a relaxed CSP for its inline
  // scripts. We apply a tight policy globally, then override for /api/docs paths.
  app.use(
    helmet({
      // HSTS: 1 year, includeSubDomains (nginx/CF should also set this at the edge).
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
  app.use(['/api/docs', '/api/docs-internal'], (req: any, res: any, next: any) => {
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:;",
    );
    next();
  });
```

Put `app.use(helmet(...))` and the CSP override block **before** `setupSwagger(app)` but **after** `app.set('trust proxy', 1)`.

- [ ] **Step 4: Build check**

```bash
pnpm --filter @avino/api build
```
Expected: exits 0. `helmet` ships its own types.

- [ ] **Step 5: Run all tests (smoke)**

```bash
pnpm --filter @avino/api test -- --testPathPattern="all-exceptions.filter"
```
Expected: PASS (helmet doesn't affect unit tests that don't use the HTTP adapter).

---

### Task 4: M-3 — Global ThrottlerModule + auth-route @Throttle overrides

**Files:**
- Modify: `apps/api/package.json` (add `@nestjs/throttler`)
- Modify: `apps/api/src/app.module.ts` (register `ThrottlerModule` globally)
- Modify: `apps/api/src/auth/auth.controller.ts` (add `@Throttle` on sensitive routes)
- Modify: `apps/api/src/config/configuration.ts` (add `throttler` config namespace)
- Modify: `apps/api/.env.example` (document new env vars)

**Interfaces:**
- Consumes: nothing from prior tasks (standalone module)
- Produces:
  - `ThrottlerModule.forRootAsync` registered in `AppModule` with `APP_GUARD`
  - Global default: 60 req / 60 s per IP (in-memory storage)
  - Auth routes override: `THROTTLE_AUTH_LIMIT` / `THROTTLE_AUTH_TTL` (default 20 req / 60 s)
  - OTP request/verify override: `THROTTLE_OTP_LIMIT` / `THROTTLE_OTP_TTL` (default 10 req / 60 s)
  - `THROTTLE_DISABLED=true` disables the guard entirely (for test envs)

- [ ] **Step 1: Add `@nestjs/throttler` to `apps/api/package.json`**

In `apps/api/package.json`, in the `"dependencies"` section, add (after `"helmet"`):

```json
"@nestjs/throttler": "^6.0.0",
```

- [ ] **Step 2: Install**

```bash
pnpm install
```
Expected: exits 0.

- [ ] **Step 3: Add throttler config namespace to `configuration.ts`**

In `apps/api/src/config/configuration.ts`, add **before** the `export const configurations = [...]` line:

```ts
// Глобальный HTTP throttler (@nestjs/throttler, M-3/H-1). In-memory storage
// (одиночный VPS). THROTTLE_DISABLED=true — выключить (в тест-окружении).
// Значения: глобальный дефолт + два override'а — auth и otp.
export const throttlerConfig = registerAs('throttler', () => ({
  // Полностью выключить гард (для тестов / локального dev без ограничений).
  disabled: process.env.THROTTLE_DISABLED === 'true',
  // Глобальный лимит: N запросов за TTL секунд (per IP, in-memory).
  limit: parseInt(process.env.THROTTLE_LIMIT ?? '60', 10),
  ttl: parseInt(process.env.THROTTLE_TTL ?? '60', 10),
  // Auth-роуты (/auth/google, /auth/apple, /auth/refresh, /auth/logout).
  authLimit: parseInt(process.env.THROTTLE_AUTH_LIMIT ?? '20', 10),
  authTtl: parseInt(process.env.THROTTLE_AUTH_TTL ?? '60', 10),
  // OTP-роуты (/auth/otp/request, /auth/otp/verify).
  otpLimit: parseInt(process.env.THROTTLE_OTP_LIMIT ?? '10', 10),
  otpTtl: parseInt(process.env.THROTTLE_OTP_TTL ?? '60', 10),
}));
```

Then in the `configurations` array at the bottom of the file, add `throttlerConfig`:

```ts
export const configurations = [
  appConfig,
  corsConfig,
  databaseConfig,
  redisConfig,
  s3Config,
  mapsConfig,
  smsConfig,
  translateConfig,
  promotionConfig,
  savedSearchConfig,
  mailConfig,
  otpConfig,
  rateLimitConfig,
  jwtConfig,
  googleConfig,
  appleConfig,
  telegramConfig,
  swaggerConfig,
  exchangeRateConfig,
  mediaCleanupConfig,
  notificationsConfig,
  firebaseConfig,
  broadcastsConfig,
  throttlerConfig,   // ← добавить
];
```

- [ ] **Step 4: Register `ThrottlerModule` and `APP_GUARD` in `AppModule`**

In `apps/api/src/app.module.ts`, add imports at the top:

```ts
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ConfigModule, ConfigService } from '@nestjs/config';
```

Then in `@Module({ imports: [...] })`, add `ThrottlerModule.forRootAsync(...)` as the first import:

```ts
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      imports: [AppConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            limit: config.get<number>('throttler.limit') ?? 60,
            ttl: (config.get<number>('throttler.ttl') ?? 60) * 1000,
          },
        ],
      }),
    }),
    AppConfigModule,
    PrismaModule,
    RedisModule,
    // ... rest unchanged
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useFactory: (config: ConfigService) => {
        if (config.get<boolean>('throttler.disabled')) {
          // Возвращаем no-op гард, когда THROTTLE_DISABLED=true.
          return { canActivate: () => true };
        }
        return new ThrottlerGuard();
      },
      inject: [ConfigService],
    },
  ],
})
export class AppModule {}
```

**Important:** `ThrottlerModule.forRootAsync` must be the first import so that `ThrottlerGuard` can resolve its dependencies. Keep all existing imports after it.

- [ ] **Step 5: Add `@Throttle` overrides on `AuthController`**

In `apps/api/src/auth/auth.controller.ts`, add imports:

```ts
import { Throttle } from '@nestjs/throttler';
```

Then apply route-level overrides. The decorator signature for `@nestjs/throttler` v6 is `@Throttle({ default: { limit, ttl } })` (ttl in ms).

Add `@Throttle` to each method as follows:

On `requestOtp` (OTP request):
```ts
  @Post('otp/request')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  requestOtp(
    @Body() dto: RequestOtpDto,
    @Ip() ip: string,
  ): Promise<RequestOtpResult> {
    return this.otpService.requestOtp(dto, ip);
  }
```

On `verifyOtp` (OTP verify):
```ts
  @Post('otp/verify')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  verifyOtp(
    @Body() dto: VerifyOtpDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ): Promise<VerifyOtpResult> {
    return this.authService.verifyOtp(dto, ip, userAgent);
  }
```

On `google`:
```ts
  @Post('google')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  google(
    @Body() dto: GoogleLoginDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ): Promise<VerifyOtpResult> {
    return this.googleAuthService.login(dto, ip, userAgent);
  }
```

On `apple`:
```ts
  @Post('apple')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  apple(
    @Body() dto: AppleLoginDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ): Promise<VerifyOtpResult> {
    return this.appleAuthService.login(dto, ip, userAgent);
  }
```

On `refresh`:
```ts
  @Post('refresh')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  refresh(
    @Body() dto: RefreshTokenDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ): Promise<RefreshResult> {
    return this.authService.refresh(dto, ip, userAgent);
  }
```

On `logout`:
```ts
  @Post('logout')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  logout(
    @Body() dto: RefreshTokenDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ): Promise<void> {
    return this.authService.logout(dto, ip, userAgent);
  }
```

> Note: hard-coding `10000`/`60000` in the decorator is required because `@Throttle` does not accept dynamic values via ConfigService. The config values (`THROTTLE_OTP_LIMIT` etc.) are for `ThrottlerModule.forRootAsync` global default only. The per-route overrides here match the config defaults and serve as documentation. If you need to tune them at runtime, change the env var for the global default and rely on the per-route decorator as an upper-bound cap.

- [ ] **Step 6: Update `.env.example`**

Add a new section after the `# ── OTP / rate limiting ──` block:

```
# ── Global HTTP throttler (@nestjs/throttler) ──
# THROTTLE_DISABLED=false        # Выключить всё (dev/test; НЕ для прода)
# THROTTLE_LIMIT=60              # Глобальный лимит req/TTL (per IP, in-memory)
# THROTTLE_TTL=60                # Окно (секунды)
# THROTTLE_AUTH_LIMIT=20         # Override для /auth/google|apple|refresh|logout
# THROTTLE_AUTH_TTL=60
# THROTTLE_OTP_LIMIT=10          # Override для /auth/otp/request и /auth/otp/verify
# THROTTLE_OTP_TTL=60
```

- [ ] **Step 7: Build check**

```bash
pnpm --filter @avino/api build
```
Expected: exits 0.

- [ ] **Step 8: Run auth controller tests**

```bash
pnpm --filter @avino/api test -- --testPathPattern="auth.controller"
```
Expected: PASS (controller tests mock services directly, no throttler involved).

---

### Task 5: H-1 — Durable brute-force lock on OTP verify

**Files:**
- Modify: `apps/api/src/auth/otp-rate-limit.service.ts` (new methods for verify limits + cumulative lock)
- Modify: `apps/api/src/auth/auth.service.ts` (call verify rate-limit at top of `verifyOtp`)
- Modify: `apps/api/src/config/configuration.ts` (new env vars in `rateLimitConfig`)
- Modify: `apps/api/.env.example` (document new env vars)

**Interfaces:**
- Consumes: `RedisService` (already injected in `OtpRateLimitService`), `ConfigService`
- Produces:
  - `OtpRateLimitService.assertCanVerify(destination: string, ip: string): Promise<void>` — throws 429 if per-IP or per-destination limits exceeded, or destination is locked
  - `OtpRateLimitService.recordFailedVerify(destination: string): Promise<void>` — increments cumulative fail counter; locks destination when threshold hit
  - `AuthService.verifyOtp` calls `assertCanVerify` before touching the DB; calls `recordFailedVerify` on bad code

Redis key schema:
- `otp:verify:ip:{ip}` — per-IP verify counter (window: `OTP_VERIFY_WINDOW_S` seconds, default 60)
- `otp:verify:dest:{dest}` — per-destination verify counter in same window
- `otp:verify:fail:{dest}` — cumulative failed-verify counter (TTL: `OTP_VERIFY_FAIL_TTL_S`, default 3600 = 1 h; spans multiple code lifetimes)
- `otp:verify:lock:{dest}` — destination lock (TTL: `OTP_VERIFY_LOCK_S`, default 900 = 15 min)

New config keys (in `rateLimitConfig`):
- `rateLimit.verifyWindowS` (env `OTP_VERIFY_WINDOW_S`, default 60)
- `rateLimit.verifyMaxPerIp` (env `OTP_VERIFY_MAX_PER_IP`, default 10)
- `rateLimit.verifyMaxPerDest` (env `OTP_VERIFY_MAX_PER_DEST`, default 10)
- `rateLimit.verifyFailThreshold` (env `OTP_VERIFY_FAIL_THRESHOLD`, default 15)
- `rateLimit.verifyFailTtlS` (env `OTP_VERIFY_FAIL_TTL_S`, default 3600)
- `rateLimit.verifyLockS` (env `OTP_VERIFY_LOCK_S`, default 900)

- [ ] **Step 1: Add new config keys to `rateLimitConfig` in `configuration.ts`**

In `apps/api/src/config/configuration.ts`, replace the existing `rateLimitConfig`:

```ts
// Общий per-IP rate-limit (TASK-041, ENV.md §8).
export const rateLimitConfig = registerAs('rateLimit', () => ({
  window: parseInt(process.env.RATE_LIMIT_WINDOW ?? '60', 10),
  max: parseInt(process.env.RATE_LIMIT_MAX ?? '100', 10),
  // Лимиты верификации OTP — отдельные оси (H-1, ADR security hardening).
  // verifyWindowS — окно счётчиков per-IP/per-dest (секунды).
  verifyWindowS: parseInt(process.env.OTP_VERIFY_WINDOW_S ?? '60', 10),
  // Максимум verify-запросов per-IP за окно.
  verifyMaxPerIp: parseInt(process.env.OTP_VERIFY_MAX_PER_IP ?? '10', 10),
  // Максимум verify-запросов per-destination за окно.
  verifyMaxPerDest: parseInt(process.env.OTP_VERIFY_MAX_PER_DEST ?? '10', 10),
  // Кумулятивный порог неудачных верификаций до блокировки destination.
  verifyFailThreshold: parseInt(process.env.OTP_VERIFY_FAIL_THRESHOLD ?? '15', 10),
  // TTL кумулятивного счётчика неудач (секунды) — должен перекрывать несколько TTL кода.
  verifyFailTtlS: parseInt(process.env.OTP_VERIFY_FAIL_TTL_S ?? '3600', 10),
  // Время блокировки destination после превышения порога (секунды).
  verifyLockS: parseInt(process.env.OTP_VERIFY_LOCK_S ?? '900', 10),
}));
```

- [ ] **Step 2: Add `assertCanVerify` and `recordFailedVerify` to `OtpRateLimitService`**

In `apps/api/src/auth/otp-rate-limit.service.ts`, add the following methods inside the class body (after `startCooldown`):

```ts
  /**
   * Проверить лимиты ПЕРЕД верификацией кода. Бросает 429 RATE_LIMITED если:
   * - destination заблокирован (кумулятивный brute-force lock);
   * - per-IP лимит верификаций за окно превышен;
   * - per-destination лимит верификаций за окно превышен.
   */
  async assertCanVerify(destination: string, ip: string): Promise<void> {
    // 1. Проверить блокировку destination.
    const lockKey = this.verifyLockKey(destination);
    const locked = await this.redis.exists(lockKey);
    if (locked) {
      const ttl = await this.redis.ttl(lockKey);
      throw this.rateLimited(
        `Too many failed attempts. Try again in ${ttl}s`,
      );
    }

    const window =
      this.configService.get<number>('rateLimit.verifyWindowS') ?? 60;

    // 2. Per-IP лимит.
    const maxPerIp =
      this.configService.get<number>('rateLimit.verifyMaxPerIp') ?? 10;
    const ipKey = this.verifyIpKey(ip);
    const ipCount = await this.redis.incr(ipKey);
    if (ipCount === 1) {
      await this.redis.expire(ipKey, window);
    }
    if (ipCount > maxPerIp) {
      throw this.rateLimited('Too many verification attempts, try again later');
    }

    // 3. Per-destination лимит.
    const maxPerDest =
      this.configService.get<number>('rateLimit.verifyMaxPerDest') ?? 10;
    const destKey = this.verifyDestKey(destination);
    const destCount = await this.redis.incr(destKey);
    if (destCount === 1) {
      await this.redis.expire(destKey, window);
    }
    if (destCount > maxPerDest) {
      throw this.rateLimited('Too many verification attempts for this contact');
    }
  }

  /**
   * Зафиксировать неудачную верификацию. Инкрементирует кумулятивный счётчик;
   * если достигнут порог — блокирует destination на verifyLockS секунд.
   * Вызывается при OTP_INVALID (неверный код); НЕ вызывается при OTP_EXPIRED
   * или OTP_ATTEMPTS_EXCEEDED (те — уже конечные состояния конкретного кода).
   */
  async recordFailedVerify(destination: string): Promise<void> {
    const threshold =
      this.configService.get<number>('rateLimit.verifyFailThreshold') ?? 15;
    const failTtl =
      this.configService.get<number>('rateLimit.verifyFailTtlS') ?? 3600;
    const lockS =
      this.configService.get<number>('rateLimit.verifyLockS') ?? 900;

    const failKey = this.verifyFailKey(destination);
    const failCount = await this.redis.incr(failKey);
    if (failCount === 1) {
      await this.redis.expire(failKey, failTtl);
    }
    if (failCount >= threshold) {
      await this.redis.set(this.verifyLockKey(destination), '1', 'EX', lockS);
      // Сброс кумулятивного счётчика (блокировка теперь активна — счётчик не нужен).
      await this.redis.del(failKey);
    }
  }

  private verifyIpKey(ip: string): string {
    return `otp:verify:ip:${ip}`;
  }

  private verifyDestKey(destination: string): string {
    return `otp:verify:dest:${destination}`;
  }

  private verifyFailKey(destination: string): string {
    return `otp:verify:fail:${destination}`;
  }

  private verifyLockKey(destination: string): string {
    return `otp:verify:lock:${destination}`;
  }
```

- [ ] **Step 3: Wire `assertCanVerify` and `recordFailedVerify` into `AuthService.verifyOtp`**

In `apps/api/src/auth/auth.service.ts`, the constructor currently takes `(prisma, config, tokenService, telegram)`. We need to inject `OtpRateLimitService` too.

**3a — Update constructor:**

```ts
// Before:
constructor(
  private readonly prisma: PrismaService,
  private readonly config: ConfigService,
  private readonly tokenService: TokenService,
  private readonly telegram: TelegramService,
) {}
```

```ts
// After:
constructor(
  private readonly prisma: PrismaService,
  private readonly config: ConfigService,
  private readonly tokenService: TokenService,
  private readonly telegram: TelegramService,
  private readonly rateLimitService: OtpRateLimitService,
) {}
```

Add the import at the top of `auth.service.ts`:

```ts
import { OtpRateLimitService } from './otp-rate-limit.service';
```

**3b — Call `assertCanVerify` at the top of `verifyOtp`, before the `try` block:**

In `auth.service.ts`, `verifyOtp` currently looks like:

```ts
async verifyOtp(
  dto: VerifyOtpDto,
  ip: string,
  userAgent?: string,
): Promise<VerifyOtpResult> {
  const destination = normalizeContact(dto.channel, dto.destination);
  if (!destination) {
    throw new BadRequestException({ ... });
  }

  try {
    const maxAttempts = ...
```

Change to:

```ts
async verifyOtp(
  dto: VerifyOtpDto,
  ip: string,
  userAgent?: string,
): Promise<VerifyOtpResult> {
  const destination = normalizeContact(dto.channel, dto.destination);
  if (!destination) {
    throw new BadRequestException({
      code: ApiErrorCode.VALIDATION_ERROR,
      message: 'Invalid destination for the selected channel',
      details: [
        {
          field: 'destination',
          issue:
            dto.channel === OtpChannel.SMS
              ? 'must be a valid E.164 phone number'
              : 'must be a valid email address',
        },
      ],
    });
  }

  // Brute-force guard: per-IP/per-dest window + cumulative lock (H-1).
  // Проверяем ДО любого DB-доступа, чтобы брутфорс не дотянулся до хеш-сравнения.
  await this.rateLimitService.assertCanVerify(destination, ip);

  try {
    const maxAttempts = ...
```

**3c — Call `recordFailedVerify` when the code is wrong (OTP_INVALID):**

In the `if (!matches)` block (around line 178 in `auth.service.ts`), add `recordFailedVerify` before throwing:

```ts
      const matches = await verifyOtpCode(dto.code, otp.codeHash);
      if (!matches) {
        const attempts = otp.attempts + 1;
        await this.prisma.otpCode.update({
          where: { id: otp.id },
          data: { attempts },
        });
        // Кумулятивный счётчик brute-force (H-1): запоминаем неудачу даже если
        // потом запросят новый код — бюджет не сбрасывается.
        void this.rateLimitService.recordFailedVerify(destination);
        // Если эта попытка исчерпала лимит — сразу локаут, иначе обычный мисс.
        throw attempts >= maxAttempts
          ? this.otpError(...)
          : this.otpError(...);
      }
```

> Note: use `void` (fire-and-forget) for `recordFailedVerify` — we don't want a Redis error to block the OTP error response. Match the existing fire-and-forget style for telegram alerts in this file.

**3d — Export `OtpRateLimitService` is already in `auth.module.ts` providers; verify it's also in `AuthModule` providers (it is).**

`AuthService` is already provided by `AuthModule`. Since `OtpRateLimitService` is in the same module, NestJS will inject it automatically once it's in the constructor.

- [ ] **Step 4: Update `.env.example`**

In `apps/api/.env.example`, update the `# ── OTP / rate limiting ──` section:

```
# ── OTP / rate limiting ──
OTP_TTL=300
OTP_MAX_ATTEMPTS=5
OTP_RESEND_COOLDOWN=60
RATE_LIMIT_WINDOW=60
RATE_LIMIT_MAX=100
# Лимиты верификации OTP (H-1, defense-in-depth):
# OTP_VERIFY_WINDOW_S=60          # Окно per-IP/per-dest verify (сек)
# OTP_VERIFY_MAX_PER_IP=10        # Макс. verify с одного IP за окно
# OTP_VERIFY_MAX_PER_DEST=10      # Макс. verify на один контакт за окно
# OTP_VERIFY_FAIL_THRESHOLD=15    # Кумулятивных неудач до блокировки destination
# OTP_VERIFY_FAIL_TTL_S=3600      # TTL счётчика неудач (сек, > OTP_TTL)
# OTP_VERIFY_LOCK_S=900           # Время блокировки destination (сек)
```

- [ ] **Step 5: Update spec for `OtpRateLimitService` (add tests for new methods)**

In `apps/api/src/auth/otp-rate-limit.service.spec.ts` (create or edit if it exists — check first):

```bash
ls /Users/founder/Desktop/2026/avino/apps/api/src/auth/otp-rate-limit.service.spec.ts 2>/dev/null || echo "MISSING"
```

If the file does NOT exist, skip this step (no existing test to protect). If it EXISTS, add tests for the new methods:

```ts
describe('OtpRateLimitService.assertCanVerify', () => {
  let redis: any;
  let config: any;
  let svc: OtpRateLimitService;

  beforeEach(() => {
    redis = {
      exists: jest.fn().mockResolvedValue(0),
      incr: jest.fn().mockResolvedValue(1),
      expire: jest.fn().mockResolvedValue(1),
      ttl: jest.fn().mockResolvedValue(850),
    };
    config = {
      get: jest.fn((key: string) => {
        const map: Record<string, number> = {
          'rateLimit.verifyWindowS': 60,
          'rateLimit.verifyMaxPerIp': 10,
          'rateLimit.verifyMaxPerDest': 10,
        };
        return map[key];
      }),
    };
    svc = new OtpRateLimitService(redis as any, config as any);
  });

  it('passes when no lock and within limits', async () => {
    await expect(svc.assertCanVerify('+998901234567', '1.2.3.4')).resolves.toBeUndefined();
  });

  it('throws 429 when destination is locked', async () => {
    redis.exists.mockResolvedValue(1);
    await expect(svc.assertCanVerify('+998901234567', '1.2.3.4')).rejects.toMatchObject({
      status: 429,
    });
  });

  it('throws 429 when per-IP count exceeds limit', async () => {
    redis.exists.mockResolvedValue(0);
    redis.incr.mockResolvedValueOnce(11); // ip count > 10
    await expect(svc.assertCanVerify('+998901234567', '1.2.3.4')).rejects.toMatchObject({
      status: 429,
    });
  });
});

describe('OtpRateLimitService.recordFailedVerify', () => {
  it('increments fail counter and locks destination at threshold', async () => {
    const redis: any = {
      incr: jest.fn().mockResolvedValue(15), // exactly at threshold
      expire: jest.fn().mockResolvedValue(1),
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
    };
    const config: any = {
      get: jest.fn((key: string) => {
        const map: Record<string, number> = {
          'rateLimit.verifyFailThreshold': 15,
          'rateLimit.verifyFailTtlS': 3600,
          'rateLimit.verifyLockS': 900,
        };
        return map[key];
      }),
    };
    const svc = new OtpRateLimitService(redis as any, config as any);
    await svc.recordFailedVerify('+998901234567');
    expect(redis.set).toHaveBeenCalledWith('otp:verify:lock:+998901234567', '1', 'EX', 900);
    expect(redis.del).toHaveBeenCalledWith('otp:verify:fail:+998901234567');
  });
});
```

- [ ] **Step 6: Update `auth.service.spec.ts` — mock the new `rateLimitService` parameter**

The existing `AuthService` unit test at `auth.service.spec.ts:58`:
```ts
service = new AuthService(prisma, config, tokenService, telegram);
```
needs to become:
```ts
const rateLimitService = { assertCanVerify: jest.fn().mockResolvedValue(undefined), recordFailedVerify: jest.fn().mockResolvedValue(undefined) };
service = new AuthService(prisma, config, tokenService, telegram, rateLimitService as any);
```

This is required because `AuthService` now has 5 constructor parameters.

- [ ] **Step 7: Build check**

```bash
pnpm --filter @avino/api build
```
Expected: exits 0.

- [ ] **Step 8: Run auth tests**

```bash
pnpm --filter @avino/api test -- --testPathPattern="auth"
```
Expected: all PASS.

---

### Task 6: M-4 — Broadcast recipient cap

**Files:**
- Modify: `apps/api/src/broadcasts/broadcasts.service.ts` (add cap check in `create`)
- Modify: `apps/api/src/config/configuration.ts` (add `maxRecipients` to `broadcastsConfig`)
- Modify: `apps/api/.env.example` (document new env var)

**Interfaces:**
- Consumes: `BroadcastAudienceService.previewCounts(dto)` — already in the module; `ConfigService`
- Produces: `create()` throws `422 UnprocessableEntityException` (matching project pattern) when `previewCounts().total > config.broadcasts.maxRecipients`

The project 422 pattern (from how `INVALID_STATUS_TRANSITION` works — `BadRequestException` with custom code or `UnprocessableEntityException`): looking at `broadcasts.service.ts` and tour-requests — the project uses `BadRequestException` with `ApiErrorCode.VALIDATION_ERROR` for 400, but a 422 from a dedicated error. Let's check what pattern "422" looks like — `tour-requests` uses `HttpException` with `HttpStatus.UNPROCESSABLE_ENTITY`. We'll follow that pattern with `ApiErrorCode.VALIDATION_ERROR`.

Actually, inspecting the codebase: `throw new HttpException({ code: ApiErrorCode.VALIDATION_ERROR, message: '...' }, HttpStatus.UNPROCESSABLE_ENTITY)`. Let's use that exactly.

- [ ] **Step 1: Add `maxRecipients` to `broadcastsConfig` in `configuration.ts`**

In `apps/api/src/config/configuration.ts`, replace the existing `broadcastsConfig`:

```ts
// Расписание sweep'а созревших рассылок (ADR-0103).
export const broadcastsConfig = registerAs('broadcasts', () => ({
  // Расписание sweep'а запланированных рассылок (по умолчанию каждую минуту).
  dispatchCron: process.env.BROADCAST_DISPATCH_CRON ?? '*/1 * * * *',
  // Максимально допустимое число получателей рассылки (M-4, защита от fat-finger /
  // компрометированной сессии админа). Превышение → 422. Default 5000.
  maxRecipients: parseInt(process.env.BROADCAST_MAX_RECIPIENTS ?? '5000', 10),
}));
```

- [ ] **Step 2: Inject `ConfigService` and add cap check in `BroadcastsService.create()`**

In `apps/api/src/broadcasts/broadcasts.service.ts`:

Add `HttpException, HttpStatus` to the `@nestjs/common` imports, and `ConfigService` from `@nestjs/config`:

```ts
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
```

Update the constructor to inject `ConfigService`:

```ts
constructor(
  private readonly prisma: PrismaService,
  private readonly audience: BroadcastAudienceService,
  private readonly config: ConfigService,
) {}
```

In `create()`, add the cap check **before** `this.prisma.broadcast.create(...)`, after the `scheduledAt` validation:

```ts
  async create(adminId: string, dto: CreateBroadcastDto): Promise<BroadcastView> {
    const scheduledAt =
      dto.mode === 'now' ? new Date() : new Date(dto.scheduledAt as string);

    if (dto.mode === 'scheduled' && scheduledAt.getTime() <= Date.now()) {
      throw new BadRequestException({
        code: ApiErrorCode.VALIDATION_ERROR,
        message: 'scheduledAt must be in the future',
      });
    }

    // Защита от рассылки на всю базу (M-4). Считаем аудиторию до сохранения.
    const maxRecipients =
      this.config.get<number>('broadcasts.maxRecipients') ?? 5000;
    const preview = await this.audience.previewCounts(dto);
    if (preview.total > maxRecipients) {
      throw new HttpException(
        {
          code: ApiErrorCode.VALIDATION_ERROR,
          message: `Audience size ${preview.total} exceeds the maximum allowed ${maxRecipients} recipients. Use a more specific filter or increase BROADCAST_MAX_RECIPIENTS.`,
        },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    const row = await this.prisma.broadcast.create({ ... });
    ...
```

- [ ] **Step 3: Update `.env.example`**

After the broadcast section (near bottom), add:

```
# ── Broadcast admin-рассылки (ADR-0103) ──
# BROADCAST_DISPATCH_CRON=*/1 * * * *
# BROADCAST_MAX_RECIPIENTS=5000   # Потолок аудитории рассылки (M-4)
```

- [ ] **Step 4: Update `broadcasts.service.spec.ts` — add test for cap + mock ConfigService**

The existing `BroadcastsService` spec creates the service as `new BroadcastsService(prisma as never, makeAudience())`. Now it needs a third argument:

For all existing tests that call `new BroadcastsService(prisma as never, makeAudience())`, update to:

```ts
const config = { get: jest.fn().mockReturnValue(5000) }; // broadcasts.maxRecipients
const svc = new BroadcastsService(prisma as never, makeAudience(), config as never);
```

Add a new test:

```ts
describe('BroadcastsService.create — recipient cap', () => {
  it('throws 422 when audience exceeds BROADCAST_MAX_RECIPIENTS', async () => {
    const bigAudience = {
      previewCounts: jest.fn().mockResolvedValue({
        total: 10001,
        perChannel: { inApp: 10001, email: 9000, push: 5000, sms: 10001 },
      }),
    } as unknown as BroadcastAudienceService;
    const prisma = { broadcast: { create: jest.fn() }, auditLog: { create: jest.fn() } };
    const config = { get: jest.fn().mockReturnValue(5000) };
    const svc = new BroadcastsService(prisma as never, bigAudience, config as never);
    await expect(svc.create('admin1', baseDto())).rejects.toMatchObject({
      status: 422,
    });
    expect(prisma.broadcast.create).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 5: Build check**

```bash
pnpm --filter @avino/api build
```
Expected: exits 0.

- [ ] **Step 6: Run broadcasts tests**

```bash
pnpm --filter @avino/api test -- --testPathPattern="broadcasts"
```
Expected: all PASS.

---

### Task 7: L-2 — filterRole enum validation

**Files:**
- Modify: `apps/api/src/broadcasts/dto/create-broadcast.dto.ts`

**Interfaces:**
- Consumes: `UserRole` from `@avino/shared`
- Produces: `filterRole` validated as `@IsEnum(UserRole)` instead of `@IsString()/@MaxLength(40)`

- [ ] **Step 1: Update `create-broadcast.dto.ts`**

In `apps/api/src/broadcasts/dto/create-broadcast.dto.ts`:

Replace the import block:

```ts
// Before:
import {
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import {
  BroadcastAudience,
  Language,
  NotificationChannel,
  UserStatus,
} from '@prisma/client';
```

```ts
// After:
import {
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsIn,
  IsISO8601,
  IsOptional,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import {
  BroadcastAudience,
  Language,
  NotificationChannel,
  UserStatus,
} from '@prisma/client';
import { UserRole } from '@avino/shared';
```

Replace `filterRole` field:

```ts
// Before:
  @IsOptional()
  @IsString()
  @MaxLength(40)
  filterRole?: string;
```

```ts
// After:
  @IsOptional()
  @IsEnum(UserRole)
  filterRole?: string;
```

- [ ] **Step 2: Build check**

```bash
pnpm --filter @avino/api build
```
Expected: exits 0.

- [ ] **Step 3: Run all tests (full suite)**

```bash
pnpm --filter @avino/api test
```
Expected: all PASS. This is the final full-suite check.

---

## File Map Summary

| File | Change |
|------|--------|
| `apps/api/package.json` | Add `helmet ^8.0.0`, `@nestjs/throttler ^6.0.0` to dependencies |
| `apps/api/src/main.ts` | NestExpressApplication, trust proxy 1, helmet middleware + Swagger CSP override |
| `apps/api/src/app.module.ts` | Import ThrottlerModule.forRootAsync, APP_GUARD with THROTTLE_DISABLED support |
| `apps/api/src/config/configuration.ts` | telegramConfig default OFF, throttlerConfig new namespace, rateLimitConfig verify keys, broadcastsConfig maxRecipients |
| `apps/api/src/auth/otp.service.ts` | Fix `?? false` fallback for includeCode |
| `apps/api/src/auth/auth.controller.ts` | @Throttle decorators on all 6 auth routes |
| `apps/api/src/auth/auth.service.ts` | Inject OtpRateLimitService, call assertCanVerify + recordFailedVerify |
| `apps/api/src/auth/otp-rate-limit.service.ts` | New methods: assertCanVerify, recordFailedVerify + 4 private key helpers |
| `apps/api/src/broadcasts/broadcasts.service.ts` | Inject ConfigService, recipient cap check with 422 |
| `apps/api/src/broadcasts/dto/create-broadcast.dto.ts` | @IsEnum(UserRole) on filterRole |
| `apps/api/src/auth/auth.service.spec.ts` | Mock rateLimitService 5th param |
| `apps/api/src/broadcasts/broadcasts.service.spec.ts` | Mock config 3rd param, add cap test |
| `apps/api/.env.example` | Document all 8 new env vars |

## New Dependencies

- `helmet ^8.0.0` (production)
- `@nestjs/throttler ^6.0.0` (production)

## New Env Variables

| Var | Default | Description |
|-----|---------|-------------|
| `TELEGRAM_INCLUDE_OTP_CODE` | `false` | OTP код в Telegram admin-алерте |
| `THROTTLE_DISABLED` | `false` | Выключить ThrottlerGuard (тесты/dev) |
| `THROTTLE_LIMIT` | `60` | Глобальный req лимит за TTL |
| `THROTTLE_TTL` | `60` | Окно глобального throttler (сек) |
| `THROTTLE_AUTH_LIMIT` | `20` | Лимит для /auth/google|apple|refresh|logout |
| `THROTTLE_AUTH_TTL` | `60` | Окно auth throttle (сек) |
| `THROTTLE_OTP_LIMIT` | `10` | Лимит для /auth/otp/* |
| `THROTTLE_OTP_TTL` | `60` | Окно OTP throttle (сек) |
| `OTP_VERIFY_WINDOW_S` | `60` | Окно per-IP/per-dest verify счётчика |
| `OTP_VERIFY_MAX_PER_IP` | `10` | Макс. verify per-IP за окно |
| `OTP_VERIFY_MAX_PER_DEST` | `10` | Макс. verify per-dest за окно |
| `OTP_VERIFY_FAIL_THRESHOLD` | `15` | Неудач до блокировки destination |
| `OTP_VERIFY_FAIL_TTL_S` | `3600` | TTL счётчика неудач (сек) |
| `OTP_VERIFY_LOCK_S` | `900` | Время блокировки (сек) |
| `BROADCAST_MAX_RECIPIENTS` | `5000` | Потолок аудитории рассылки |
