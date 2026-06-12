# Google Auth · OTP verify · Telegram admin alerts — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Google Sign-In to the public portal, fully verify the OTP register/login flow, and send config-gated Telegram alerts to the admin on auth events with a runtime on/off toggle.

**Architecture:** New isolated `apps/api/src/telegram/` module (transport + message formatters + enabled-gate) wired into `AuthModule`; alert hooks added to `OtpService`/`AuthService`; new `GoogleAuthService` verifies Google ID-tokens via `google-auth-library` and reuses `TokenService`; a new ADMIN endpoint `/admin/telegram-settings` flips a row in the existing `app_settings` table for runtime toggling. Frontend: a Google button in the client `LoginModal` and a toggle island on the web admin settings page.

**Tech Stack:** NestJS 10 + Prisma + PostgreSQL, `google-auth-library`, Jest (api), Next.js 15 + RTK Query (client/web), pnpm workspaces, RTK CLI wrapper for shell.

**Branch:** `feat/auth-google-telegram-alerts` (already created; spec committed).

**Conventions:**
- API tests: `rtk pnpm --filter @avino/api test -- <path-or-pattern>`.
- API lint/build: `rtk pnpm --filter @avino/api lint` / `rtk pnpm --filter @avino/api build`.
- Client/web (no unit tests): gate on `rtk pnpm --filter @avino/shared build && rtk pnpm --filter @avino/<app> lint`.
- The controller (executor) owns all git. Commit after each task.

---

## File Structure

**Create (api):**
- `apps/api/src/telegram/telegram.constants.ts` — setting key + pure `resolveNotificationsEnabled`.
- `apps/api/src/telegram/auth-alert.util.ts` — pure message formatters.
- `apps/api/src/telegram/telegram.service.ts` — transport + enabled gate.
- `apps/api/src/telegram/telegram.module.ts` — provides/exports `TelegramService`.
- `apps/api/src/telegram/index.ts` — barrel.
- `apps/api/src/telegram/auth-alert.util.spec.ts`, `telegram.service.spec.ts` — tests.
- `apps/api/src/auth/google-auth.service.ts` + `.spec.ts` — Google verify + resolve.
- `apps/api/src/auth/dto/google-login.dto.ts`.
- `apps/api/src/admin/admin-telegram-settings.service.ts` + `.spec.ts`.
- `apps/api/src/admin/admin-telegram-settings.controller.ts`.
- `apps/api/src/admin/dto/update-telegram-settings.dto.ts`.

**Modify (api):**
- `apps/api/src/config/configuration.ts` — `googleConfig`, `telegramConfig`.
- `apps/api/src/config/env.validation.ts` — 5 optional vars.
- `apps/api/src/common/dto/error-response.dto.ts` — `AUTH_PROVIDER_UNAVAILABLE`.
- `apps/api/src/auth/otp.service.ts` — request alert hook.
- `apps/api/src/auth/auth.service.ts` — success/fail alert hooks + `isNew` on resolve.
- `apps/api/src/auth/auth.controller.ts` — `POST /auth/google`.
- `apps/api/src/auth/auth.module.ts` — import `TelegramModule`, provide `GoogleAuthService`.
- `apps/api/src/admin/admin.module.ts` — register telegram-settings controller/service.

**Create/Modify (client):**
- `apps/client/src/store/api/authApi.ts` — `googleLogin` mutation.
- `apps/client/src/components/layout/GoogleSignInButton.tsx` — GIS button.
- `apps/client/src/components/layout/LoginModal.tsx` — divider + Google button.
- `apps/client/messages/{ru,uz,en}.json` — `auth.or`, `auth.continueWithGoogle`.

**Create/Modify (web):**
- `apps/web/src/store/api/adminTelegramSettingsApi.ts` — get/update endpoints.
- `apps/web/src/components/admin/TelegramNotificationsToggle.tsx` — client island.
- `apps/web/src/app/admin/settings/page.tsx` — mount the toggle.

**Docs:** `docs/ENV.md`, `docs/API.md`, new `docs/adr/ADR-00XX-*.md`, `docs/DONE.md`.

---

## Task 1: Config + env for Google & Telegram

**Files:**
- Modify: `apps/api/src/config/configuration.ts`
- Modify: `apps/api/src/config/env.validation.ts`

- [ ] **Step 1: Add config namespaces.** In `configuration.ts`, add after `jwtConfig`:

```ts
export const googleConfig = registerAs('google', () => ({
  clientId: process.env.GOOGLE_CLIENT_ID,
}));

export const telegramConfig = registerAs('telegram', () => ({
  botToken: process.env.TELEGRAM_BOT_TOKEN,
  adminChatId: process.env.TELEGRAM_ADMIN_CHAT_ID,
  // Строкой в env (как S3_FORCE_PATH_STYLE): default true.
  includeOtpCode: process.env.TELEGRAM_INCLUDE_OTP_CODE !== 'false',
  // Master-флаг по умолчанию: явное значение → оно; иначе dev=true / prod=false.
  notificationStateDefault:
    process.env.TELEGRAM_NOTIFICATION_STATE != null
      ? process.env.TELEGRAM_NOTIFICATION_STATE === 'true'
      : process.env.NODE_ENV !== 'production',
}));
```

Then add both to the `configurations` array:

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
  telegramConfig,
];
```

- [ ] **Step 2: Add optional env vars.** In `env.validation.ts`, inside `EnvironmentVariables` (after JWT block), add:

```ts
  // ── Google Sign-In (опционально на старте) ──
  @IsString()
  @IsOptional()
  GOOGLE_CLIENT_ID?: string;

  // ── Telegram admin-алерты (опционально на старте) ──
  @IsString()
  @IsOptional()
  TELEGRAM_BOT_TOKEN?: string;

  @IsString()
  @IsOptional()
  TELEGRAM_ADMIN_CHAT_ID?: string;

  // Булевы как строки (class-transformer привёл бы любую непустую к true).
  @IsString()
  @IsOptional()
  TELEGRAM_INCLUDE_OTP_CODE?: string;

  @IsString()
  @IsOptional()
  TELEGRAM_NOTIFICATION_STATE?: string;
```

- [ ] **Step 3: Verify build/lint.**

Run: `rtk pnpm --filter @avino/api build`
Expected: build succeeds (no type errors).

- [ ] **Step 4: Commit.**

```bash
git add apps/api/src/config/configuration.ts apps/api/src/config/env.validation.ts
git commit -m "feat(api): config+env for Google sign-in and Telegram alerts"
```

---

## Task 2: Telegram constants + enabled resolver (TDD)

**Files:**
- Create: `apps/api/src/telegram/telegram.constants.ts`
- Test: covered indirectly by service spec (Task 4); add a focused unit test here.
- Create: `apps/api/src/telegram/telegram.constants.spec.ts`

- [ ] **Step 1: Write failing test.** Create `telegram.constants.spec.ts`:

```ts
import { resolveNotificationsEnabled } from './telegram.constants';

describe('resolveNotificationsEnabled', () => {
  it('returns true when stored "true"', () => {
    expect(resolveNotificationsEnabled('true', false)).toBe(true);
  });
  it('returns false when stored "false"', () => {
    expect(resolveNotificationsEnabled('false', true)).toBe(false);
  });
  it('falls back to env default when unset/garbage', () => {
    expect(resolveNotificationsEnabled(null, true)).toBe(true);
    expect(resolveNotificationsEnabled(undefined, false)).toBe(false);
    expect(resolveNotificationsEnabled('garbage', true)).toBe(true);
  });
});
```

- [ ] **Step 2: Run, verify it fails.**

Run: `rtk pnpm --filter @avino/api test -- telegram.constants`
Expected: FAIL — cannot find module `./telegram.constants`.

- [ ] **Step 3: Implement.** Create `telegram.constants.ts`:

```ts
/** Ключ runtime-настройки в app_settings для master-тоггла Telegram-алертов. */
export const TELEGRAM_NOTIFICATIONS_ENABLED_KEY = 'telegram_notifications_enabled';

/**
 * Резолюция master-флага: значение из app_settings (если 'true'/'false')
 * главнее; иначе — env-дефолт (dev=true / prod=false из configuration.ts).
 * Чистая функция — шарится между TelegramService и AdminTelegramSettingsService.
 */
export function resolveNotificationsEnabled(
  stored: string | null | undefined,
  envDefault: boolean,
): boolean {
  if (stored === 'true') return true;
  if (stored === 'false') return false;
  return envDefault;
}
```

- [ ] **Step 4: Run, verify pass.**

Run: `rtk pnpm --filter @avino/api test -- telegram.constants`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit.**

```bash
git add apps/api/src/telegram/telegram.constants.ts apps/api/src/telegram/telegram.constants.spec.ts
git commit -m "feat(api): telegram setting key + enabled resolver"
```

---

## Task 3: Auth alert formatters (TDD)

**Files:**
- Create: `apps/api/src/telegram/auth-alert.util.ts`
- Test: `apps/api/src/telegram/auth-alert.util.spec.ts`

- [ ] **Step 1: Write failing test.**

```ts
import { OtpChannel } from '@prisma/client';
import {
  formatLoginFailed,
  formatLoginSuccess,
  formatOtpRequest,
} from './auth-alert.util';

describe('auth-alert formatters', () => {
  it('formatOtpRequest includes code when provided', () => {
    const msg = formatOtpRequest({
      destination: '+998901234567',
      channel: OtpChannel.SMS,
      code: '482913',
      ip: '84.54.1.1',
      isNewUser: true,
    });
    expect(msg).toContain('+998901234567');
    expect(msg).toContain('482913');
    expect(msg).toContain('новый');
  });

  it('formatOtpRequest omits code when undefined', () => {
    const msg = formatOtpRequest({
      destination: '+998901234567',
      channel: OtpChannel.SMS,
      ip: null,
      isNewUser: false,
    });
    expect(msg).not.toContain('КОД');
  });

  it('formatLoginSuccess shows provider when given', () => {
    const msg = formatLoginSuccess({
      destination: 'a@b.com',
      ip: '1.1.1.1',
      isNewUser: false,
      roles: ['USER'],
      provider: 'GOOGLE',
    });
    expect(msg).toContain('GOOGLE');
    expect(msg).toContain('USER');
  });

  it('formatLoginFailed shows reason', () => {
    const msg = formatLoginFailed({
      destination: '+998901234567',
      channel: OtpChannel.SMS,
      ip: null,
      reason: 'OTP_INVALID',
    });
    expect(msg).toContain('OTP_INVALID');
  });

  it('escapes HTML in destination', () => {
    const msg = formatLoginFailed({
      destination: '<script>@x',
      channel: OtpChannel.EMAIL,
      ip: null,
      reason: 'OTP_EXPIRED',
    });
    expect(msg).toContain('&lt;script&gt;');
  });
});
```

- [ ] **Step 2: Run, verify it fails.**

Run: `rtk pnpm --filter @avino/api test -- auth-alert.util`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement `auth-alert.util.ts`.**

```ts
import { OtpChannel } from '@prisma/client';

/** Минимальное HTML-экранирование для parse_mode=HTML. */
function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export interface OtpRequestAlert {
  destination: string;
  channel: OtpChannel;
  code?: string;
  ip?: string | null;
  isNewUser: boolean;
}

export function formatOtpRequest(a: OtpRequestAlert): string {
  const lines = [
    '🔔 <b>Avino: запрос OTP</b>',
    `Контакт: ${esc(a.destination)} (${a.channel})`,
  ];
  if (a.code) lines.push(`КОД: <code>${esc(a.code)}</code>`);
  lines.push(`IP: ${esc(a.ip ?? '—')}`);
  lines.push(`Статус: ${a.isNewUser ? 'новый пользователь' : 'существующий'}`);
  return lines.join('\n');
}

export interface LoginSuccessAlert {
  destination: string | null;
  channel?: OtpChannel;
  ip?: string | null;
  isNewUser: boolean;
  roles?: string[];
  provider?: 'GOOGLE';
}

export function formatLoginSuccess(a: LoginSuccessAlert): string {
  const via = a.provider ?? a.channel ?? '—';
  const lines = [
    '✅ <b>Avino: вход выполнен</b>',
    `Контакт: ${esc(a.destination ?? '—')} (${via})`,
    `IP: ${esc(a.ip ?? '—')}`,
    `Статус: ${a.isNewUser ? 'зарегистрирован новый пользователь' : 'существующий'}`,
  ];
  if (a.roles && a.roles.length > 0) {
    lines.push(`Роли: ${esc(a.roles.join(', '))}`);
  }
  return lines.join('\n');
}

export interface LoginFailedAlert {
  destination: string;
  channel: OtpChannel;
  ip?: string | null;
  reason: string;
}

export function formatLoginFailed(a: LoginFailedAlert): string {
  return [
    '⚠️ <b>Avino: неудачный вход</b>',
    `Контакт: ${esc(a.destination)} (${a.channel})`,
    `IP: ${esc(a.ip ?? '—')}`,
    `Причина: ${esc(a.reason)}`,
  ].join('\n');
}
```

- [ ] **Step 4: Run, verify pass.**

Run: `rtk pnpm --filter @avino/api test -- auth-alert.util`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit.**

```bash
git add apps/api/src/telegram/auth-alert.util.ts apps/api/src/telegram/auth-alert.util.spec.ts
git commit -m "feat(api): telegram auth-alert message formatters"
```

---

## Task 4: TelegramService + module (TDD)

**Files:**
- Create: `apps/api/src/telegram/telegram.service.ts`
- Create: `apps/api/src/telegram/telegram.module.ts`
- Create: `apps/api/src/telegram/index.ts`
- Test: `apps/api/src/telegram/telegram.service.spec.ts`

- [ ] **Step 1: Write failing test.**

```ts
import { TelegramService } from './telegram.service';

function makeService(overrides: {
  config?: Record<string, unknown>;
  storedEnabled?: string | null;
}) {
  const cfg = {
    'app.env': 'development',
    'telegram.notificationStateDefault': true,
    'telegram.botToken': 'TOK',
    'telegram.adminChatId': '123',
    ...(overrides.config ?? {}),
  };
  const config = { get: (k: string) => cfg[k] };
  const prisma = {
    appSetting: {
      findUnique: jest
        .fn()
        .mockResolvedValue(
          overrides.storedEnabled === undefined
            ? null
            : { value: overrides.storedEnabled },
        ),
    },
  };
  return new TelegramService(config as never, prisma as never);
}

describe('TelegramService', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    jest.restoreAllMocks();
  });

  it('isEnabled: DB "false" overrides env default true', async () => {
    const s = makeService({ storedEnabled: 'false' });
    expect(await s.isEnabled()).toBe(false);
  });

  it('isEnabled: env default used when no DB row', async () => {
    const s = makeService({
      storedEnabled: undefined,
      config: { 'telegram.notificationStateDefault': false },
    });
    expect(await s.isEnabled()).toBe(false);
  });

  it('sendAdminAlert: no-op (no fetch) when disabled', async () => {
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy as never;
    const s = makeService({ storedEnabled: 'false' });
    await s.sendAdminAlert('hi');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('sendAdminAlert: no fetch when creds missing (dev log)', async () => {
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy as never;
    const s = makeService({ config: { 'telegram.botToken': undefined } });
    await s.sendAdminAlert('hi');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('sendAdminAlert: calls Bot API when enabled+configured', async () => {
    const fetchSpy = jest.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchSpy as never;
    const s = makeService({ storedEnabled: 'true' });
    await s.sendAdminAlert('hello');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toContain('/botTOK/sendMessage');
    expect(JSON.parse(init.body)).toMatchObject({ chat_id: '123', text: 'hello' });
  });

  it('sendAdminAlert: never throws when fetch rejects', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network')) as never;
    const s = makeService({ storedEnabled: 'true' });
    await expect(s.sendAdminAlert('x')).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run, verify it fails.**

Run: `rtk pnpm --filter @avino/api test -- telegram.service`
Expected: FAIL — cannot find module `./telegram.service`.

- [ ] **Step 3: Implement `telegram.service.ts`.**

```ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma';
import {
  TELEGRAM_NOTIFICATIONS_ENABLED_KEY,
  resolveNotificationsEnabled,
} from './telegram.constants';

/**
 * TelegramService — отправка admin-алертов через Bot API (config-gated).
 *
 * Зеркалит паттерн SmsService: нет кредов → dev-лог/no-op. Доставка
 * best-effort: метод НИКОГДА не бросает, чтобы сбой Telegram не ломал логин.
 * Включённость управляется двухслойно: app_settings-строка (runtime, через
 * admin-эндпоинт) главнее env-дефолта (dev=true / prod=false).
 */
@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  /** Включены ли алерты сейчас: DB-override > env-дефолт. */
  async isEnabled(): Promise<boolean> {
    const envDefault =
      this.config.get<boolean>('telegram.notificationStateDefault') ?? false;
    try {
      const row = await this.prisma.appSetting.findUnique({
        where: { key: TELEGRAM_NOTIFICATIONS_ENABLED_KEY },
      });
      return resolveNotificationsEnabled(row?.value, envDefault);
    } catch {
      // БД недоступна — не роняем поток, падаем на env-дефолт.
      return envDefault;
    }
  }

  /** Отправить алерт админу. Best-effort, никогда не бросает. */
  async sendAdminAlert(text: string): Promise<void> {
    try {
      if (!(await this.isEnabled())) return;

      const token = this.config.get<string>('telegram.botToken');
      const chatId = this.config.get<string>('telegram.adminChatId');
      if (!token || !chatId) {
        this.logUndelivered(text);
        return;
      }

      const res = await fetch(
        `https://api.telegram.org/bot${token}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text,
            parse_mode: 'HTML',
            disable_web_page_preview: true,
          }),
        },
      );
      if (!res.ok) {
        this.logger.error(`Telegram sendMessage failed: ${res.status}`);
      }
    } catch (err) {
      this.logger.error(
        `Telegram alert error: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  private logUndelivered(text: string): void {
    if (this.config.get<string>('app.env') === 'production') {
      this.logger.warn('Telegram is not configured; admin alert NOT sent');
      return;
    }
    this.logger.warn(`[DEV Telegram → admin]\n${text}`);
  }
}
```

- [ ] **Step 4: Implement `telegram.module.ts`.**

```ts
import { Module } from '@nestjs/common';
import { TelegramService } from './telegram.service';

/**
 * TelegramModule — admin-алерты (PrismaModule глобальный, ConfigModule
 * глобальный, поэтому imports не нужны). Экспортирует TelegramService для
 * AuthModule (хуки алертов).
 */
@Module({
  providers: [TelegramService],
  exports: [TelegramService],
})
export class TelegramModule {}
```

- [ ] **Step 5: Implement `index.ts` barrel.**

```ts
export * from './telegram.module';
export * from './telegram.service';
export * from './telegram.constants';
export * from './auth-alert.util';
```

- [ ] **Step 6: Run, verify pass.**

Run: `rtk pnpm --filter @avino/api test -- telegram.service`
Expected: PASS (6 tests).

- [ ] **Step 7: Commit.**

```bash
git add apps/api/src/telegram/telegram.service.ts apps/api/src/telegram/telegram.module.ts apps/api/src/telegram/index.ts apps/api/src/telegram/telegram.service.spec.ts
git commit -m "feat(api): TelegramService transport + enabled gate + module"
```

---

## Task 5: Wire TelegramModule into Auth + OTP request alert (TDD)

**Files:**
- Modify: `apps/api/src/auth/auth.module.ts`
- Modify: `apps/api/src/auth/otp.service.ts`
- Modify: `apps/api/src/auth/otp.service.spec.ts`

- [ ] **Step 1: Add failing test to `otp.service.spec.ts`.** Add a `TelegramService` mock to the existing test setup and a new case. (Inspect the existing spec's constructor call and extend it.) The new test:

```ts
it('fires a telegram alert with the code on request', async () => {
  // arrange: reuse existing successful-request setup; add telegram spy
  // `telegram` is the mock passed as the new last constructor arg.
  await service.requestOtp(
    { channel: 'SMS', destination: '+998901234567' } as never,
    '1.2.3.4',
  );
  expect(telegram.sendAdminAlert).toHaveBeenCalledTimes(1);
  expect(telegram.sendAdminAlert.mock.calls[0][0]).toContain('+998901234567');
});
```

In the spec's `beforeEach`, add:
```ts
const telegram = { sendAdminAlert: jest.fn().mockResolvedValue(undefined) };
```
and append `telegram as never` to the `new OtpService(...)` call (last arg). Also stub `configService.get` so `'telegram.includeOtpCode'` returns `true`.

- [ ] **Step 2: Run, verify it fails.**

Run: `rtk pnpm --filter @avino/api test -- otp.service`
Expected: FAIL — `OtpService` constructor arity / `telegram.sendAdminAlert` not called.

- [ ] **Step 3: Inject + hook in `otp.service.ts`.** Add import:

```ts
import { TelegramService, formatOtpRequest } from '../telegram';
```

Add constructor param (after `email`):
```ts
    private readonly email: EmailService,
    private readonly telegram: TelegramService,
```

After `await this.deliver(dto.channel, destination, code);` and before computing `resendAfter`, add:
```ts
    const includeCode =
      this.configService.get<boolean>('telegram.includeOtpCode') ?? true;
    void this.telegram.sendAdminAlert(
      formatOtpRequest({
        destination,
        channel: dto.channel,
        code: includeCode ? code : undefined,
        ip,
        isNewUser: user == null,
      }),
    );
```

- [ ] **Step 4: Wire `TelegramModule` in `auth.module.ts`.** Add import + module to `imports`:

```ts
import { TelegramModule } from '../telegram';
// ...
  imports: [SmsModule, EmailModule, JwtModule.register({}), RolesModule, TelegramModule],
```

- [ ] **Step 5: Run, verify pass + build.**

Run: `rtk pnpm --filter @avino/api test -- otp.service`
Expected: PASS.
Run: `rtk pnpm --filter @avino/api build`
Expected: build succeeds.

- [ ] **Step 6: Commit.**

```bash
git add apps/api/src/auth/auth.module.ts apps/api/src/auth/otp.service.ts apps/api/src/auth/otp.service.spec.ts
git commit -m "feat(api): telegram alert on OTP request (with code)"
```

---

## Task 6: AuthService verify success/fail alerts (TDD)

**Files:**
- Modify: `apps/api/src/auth/auth.service.ts`
- Modify: `apps/api/src/auth/auth.service.spec.ts`

- [ ] **Step 1: Add failing tests to `auth.service.spec.ts`.** Add a telegram mock as the last constructor arg `new AuthService(prisma, config, tokenService, telegram)` and tests:

```ts
it('alerts login success after verify', async () => {
  // reuse existing happy-path verifyOtp setup
  await service.verifyOtp(
    { channel: 'SMS', destination: '+998901234567', code: '123456' } as never,
    '1.2.3.4',
    'UA',
  );
  expect(telegram.sendAdminAlert).toHaveBeenCalledWith(
    expect.stringContaining('вход выполнен'),
  );
});

it('alerts login failure on OTP_INVALID and rethrows', async () => {
  prisma.otpCode.findFirst.mockResolvedValue(null); // → OTP_INVALID
  await expect(
    service.verifyOtp(
      { channel: 'SMS', destination: '+998901234567', code: '123456' } as never,
      '1.2.3.4',
    ),
  ).rejects.toBeDefined();
  expect(telegram.sendAdminAlert).toHaveBeenCalledWith(
    expect.stringContaining('OTP_INVALID'),
  );
});
```

Add in setup: `const telegram = { sendAdminAlert: jest.fn().mockResolvedValue(undefined) };`

- [ ] **Step 2: Run, verify it fails.**

Run: `rtk pnpm --filter @avino/api test -- auth.service`
Expected: FAIL.

- [ ] **Step 3: Implement in `auth.service.ts`.** Add imports:

```ts
import { TelegramService, formatLoginFailed, formatLoginSuccess } from '../telegram';
```

Add constructor param (after `tokenService`):
```ts
    private readonly tokenService: TokenService,
    private readonly telegram: TelegramService,
```

Add a failure-code set + extractor as private members:
```ts
  private static readonly ALERT_FAILURE_CODES = new Set<string>([
    ApiErrorCode.OTP_INVALID,
    ApiErrorCode.OTP_EXPIRED,
    ApiErrorCode.OTP_ATTEMPTS_EXCEEDED,
    ApiErrorCode.USER_BLOCKED,
  ]);

  private extractErrorCode(err: unknown): string | undefined {
    if (err instanceof HttpException) {
      const res = err.getResponse();
      if (typeof res === 'object' && res !== null && 'code' in res) {
        return (res as { code?: string }).code;
      }
    }
    return undefined;
  }
```

Wrap the body of `verifyOtp` after the destination-validation block in try/catch. Keep the `if (!destination) { throw ... }` BEFORE the try (no alert for malformed contact). The success alert goes right before the existing `return { ... }`:

```ts
    void this.telegram.sendAdminAlert(
      formatLoginSuccess({
        destination,
        channel: dto.channel,
        ip,
        isNewUser: user.isNew,
        roles: user.roles,
      }),
    );

    return {
      access_token: tokens.accessToken,
      // ...unchanged...
    };
```

Wrap with catch (closing the try opened after destination validation):
```ts
    } catch (err) {
      const code = this.extractErrorCode(err);
      if (code && AuthService.ALERT_FAILURE_CODES.has(code)) {
        void this.telegram.sendAdminAlert(
          formatLoginFailed({
            destination,
            channel: dto.channel,
            ip,
            reason: code,
          }),
        );
      }
      throw err;
    }
```

- [ ] **Step 4: Add `isNew` to resolveUser.** Change `ResolvedUser` interface to add `isNew: boolean;`. In `resolveUser`, existing-user branch returns `this.toResolved(updated, false)`, new-user branch returns `this.toResolved(created, true)`. Update `toResolved` signature to accept `isNew: boolean` and include it in the returned object.

- [ ] **Step 5: Run, verify pass + build.**

Run: `rtk pnpm --filter @avino/api test -- auth.service`
Expected: PASS.
Run: `rtk pnpm --filter @avino/api build`
Expected: succeeds.

- [ ] **Step 6: Commit.**

```bash
git add apps/api/src/auth/auth.service.ts apps/api/src/auth/auth.service.spec.ts
git commit -m "feat(api): telegram alerts on OTP verify success/failure"
```

---

## Task 7: google-auth-library + AUTH_PROVIDER_UNAVAILABLE + GoogleAuthService (TDD)

**Files:**
- Modify: `apps/api/package.json` (dependency)
- Modify: `apps/api/src/common/dto/error-response.dto.ts`
- Create: `apps/api/src/auth/dto/google-login.dto.ts`
- Create: `apps/api/src/auth/google-auth.service.ts`
- Test: `apps/api/src/auth/google-auth.service.spec.ts`

- [ ] **Step 1: Install dependency.**

Run: `rtk pnpm --filter @avino/api add google-auth-library`
Expected: package added to `apps/api/package.json` dependencies.

- [ ] **Step 2: Add error code.** In `error-response.dto.ts`, add to `ApiErrorCode` enum (after `USER_BLOCKED`):

```ts
  AUTH_PROVIDER_UNAVAILABLE = 'AUTH_PROVIDER_UNAVAILABLE',
```

- [ ] **Step 3: Create `dto/google-login.dto.ts`.**

```ts
import { IsNotEmpty, IsString } from 'class-validator';

/** Тело `POST /api/v1/auth/google` — ID-token из Google Identity Services. */
export class GoogleLoginDto {
  @IsString()
  @IsNotEmpty()
  id_token!: string;
}
```

- [ ] **Step 4: Write failing test `google-auth.service.spec.ts`.**

```ts
import { GoogleAuthService } from './google-auth.service';

const verifyIdToken = jest.fn();
jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({ verifyIdToken })),
}));

function makeService(clientId: string | undefined, prismaOverrides: object = {}) {
  const config = {
    get: (k: string) => (k === 'google.clientId' ? clientId : undefined),
  };
  const prisma = {
    user: { findFirst: jest.fn(), update: jest.fn(), findUniqueOrThrow: jest.fn() },
    role: { findUnique: jest.fn().mockResolvedValue({ id: 'r1' }) },
    userRole: { create: jest.fn() },
    auditLog: { create: jest.fn() },
    $transaction: jest.fn(async (cb) => cb(prisma)),
    ...prismaOverrides,
  };
  const tokenService = {
    issueSession: jest
      .fn()
      .mockResolvedValue({ accessToken: 'a', refreshToken: 'r', expiresIn: 900 }),
  };
  const telegram = { sendAdminAlert: jest.fn().mockResolvedValue(undefined) };
  const service = new GoogleAuthService(
    prisma as never,
    config as never,
    tokenService as never,
    telegram as never,
  );
  return { service, prisma, tokenService, telegram };
}

const ROLES_INCLUDE = {
  roles: [{ role: { code: 'USER' } }],
  id: 'u1',
  phone: null,
  email: 'a@b.com',
  defaultLanguage: 'RU',
  status: 'ACTIVE',
  isPhoneVerified: false,
  isEmailVerified: true,
};

describe('GoogleAuthService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('503 when GOOGLE_CLIENT_ID not configured', async () => {
    const { service } = makeService(undefined);
    await expect(service.login({ id_token: 't' })).rejects.toMatchObject({
      response: { code: 'AUTH_PROVIDER_UNAVAILABLE' },
    });
  });

  it('401 when token invalid', async () => {
    verifyIdToken.mockRejectedValue(new Error('bad'));
    const { service } = makeService('CID');
    await expect(service.login({ id_token: 't' })).rejects.toMatchObject({
      response: { code: 'UNAUTHORIZED' },
    });
  });

  it('401 when email not verified', async () => {
    verifyIdToken.mockResolvedValue({
      getPayload: () => ({ email: 'a@b.com', sub: 's', email_verified: false }),
    });
    const { service } = makeService('CID');
    await expect(service.login({ id_token: 't' })).rejects.toMatchObject({
      response: { code: 'UNAUTHORIZED' },
    });
  });

  it('issues session for existing user', async () => {
    verifyIdToken.mockResolvedValue({
      getPayload: () => ({ email: 'a@b.com', sub: 's', email_verified: true, name: 'A B' }),
    });
    const { service, prisma, tokenService } = makeService('CID');
    prisma.user.findFirst.mockResolvedValue(ROLES_INCLUDE);
    prisma.user.update.mockResolvedValue(ROLES_INCLUDE);
    const res = await service.login({ id_token: 't' }, '1.1.1.1', 'UA');
    expect(tokenService.issueSession).toHaveBeenCalled();
    expect(res.access_token).toBe('a');
    expect(res.user.email).toBe('a@b.com');
  });

  it('creates a new user when none exists', async () => {
    verifyIdToken.mockResolvedValue({
      getPayload: () => ({ email: 'new@b.com', sub: 's', email_verified: true, name: 'New User', picture: 'p' }),
    });
    const { service, prisma } = makeService('CID');
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.create = jest.fn().mockResolvedValue({ id: 'u2' });
    prisma.user.findUniqueOrThrow.mockResolvedValue({ ...ROLES_INCLUDE, id: 'u2', email: 'new@b.com' });
    const res = await service.login({ id_token: 't' });
    expect(prisma.user.create).toHaveBeenCalled();
    expect(res.user.id).toBe('u2');
  });
});
```

- [ ] **Step 5: Run, verify it fails.**

Run: `rtk pnpm --filter @avino/api test -- google-auth.service`
Expected: FAIL — cannot find module `./google-auth.service`.

- [ ] **Step 6: Implement `google-auth.service.ts`.**

```ts
import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Language, UserStatus } from '@prisma/client';
import { OAuth2Client } from 'google-auth-library';
import { UserRole } from '@avino/shared';
import { ApiErrorCode } from '../common/dto/error-response.dto';
import { PrismaService } from '../prisma';
import { TelegramService, formatLoginSuccess } from '../telegram';
import { VerifyOtpResult } from './auth.service';
import { TokenService } from './token.service';
import { GoogleLoginDto } from './dto/google-login.dto';

interface GooglePayload {
  email: string;
  emailVerified: boolean;
  name?: string;
  picture?: string;
  sub: string;
}

interface ResolvedGoogleUser {
  id: string;
  phone: string | null;
  email: string | null;
  defaultLanguage: Language;
  status: UserStatus;
  isPhoneVerified: boolean;
  isEmailVerified: boolean;
  roles: string[];
}

/**
 * GoogleAuthService — passwordless вход через Google ID-token (ADR — Google).
 * Верификация токена офлайн через google-auth-library; связывание аккаунта по
 * верифицированному email (email_verified=true обязателен). Логин=signup, как
 * и в OTP-флоу. Сессия выпускается тем же TokenService.
 */
@Injectable()
export class GoogleAuthService {
  private readonly logger = new Logger(GoogleAuthService.name);
  private client: OAuth2Client | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly tokenService: TokenService,
    private readonly telegram: TelegramService,
  ) {}

  async login(
    dto: GoogleLoginDto,
    ip?: string,
    userAgent?: string,
  ): Promise<VerifyOtpResult> {
    const clientId = this.config.get<string>('google.clientId');
    if (!clientId) {
      throw new HttpException(
        {
          code: ApiErrorCode.AUTH_PROVIDER_UNAVAILABLE,
          message: 'Google sign-in is not configured',
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const payload = await this.verifyToken(dto.id_token, clientId);
    if (!payload.emailVerified) {
      throw new HttpException(
        { code: ApiErrorCode.UNAUTHORIZED, message: 'Google email is not verified' },
        HttpStatus.UNAUTHORIZED,
      );
    }

    const { user, isNew } = await this.resolveByEmail(payload);

    const tokens = await this.tokenService.issueSession({
      userId: user.id,
      roles: user.roles,
      ip,
      userAgent,
    });

    await this.prisma.auditLog.create({
      data: {
        actorId: user.id,
        action: 'LOGIN',
        entityType: 'user',
        entityId: user.id,
        ip: ip ? ip.slice(0, 64) : null,
        userAgent: userAgent ?? null,
        metadata: { provider: 'GOOGLE' },
      },
    });

    void this.telegram.sendAdminAlert(
      formatLoginSuccess({
        destination: user.email,
        ip,
        isNewUser: isNew,
        roles: user.roles,
        provider: 'GOOGLE',
      }),
    );

    return {
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      token_type: 'Bearer',
      expires_in: tokens.expiresIn,
      user: {
        id: user.id,
        phone: user.phone,
        email: user.email,
        default_language: user.defaultLanguage,
        status: user.status,
        roles: user.roles,
        is_phone_verified: user.isPhoneVerified,
        is_email_verified: user.isEmailVerified,
      },
    };
  }

  private async verifyToken(
    idToken: string,
    clientId: string,
  ): Promise<GooglePayload> {
    if (!this.client) {
      this.client = new OAuth2Client(clientId);
    }
    try {
      const ticket = await this.client.verifyIdToken({
        idToken,
        audience: clientId,
      });
      const p = ticket.getPayload();
      if (!p?.email || !p.sub) {
        throw new Error('Google payload missing email/sub');
      }
      return {
        email: p.email.toLowerCase(),
        emailVerified: p.email_verified === true,
        name: p.name,
        picture: p.picture,
        sub: p.sub,
      };
    } catch (err) {
      this.logger.warn(
        `Google token verification failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      throw new HttpException(
        { code: ApiErrorCode.UNAUTHORIZED, message: 'Invalid Google token' },
        HttpStatus.UNAUTHORIZED,
      );
    }
  }

  private async resolveByEmail(
    payload: GooglePayload,
  ): Promise<{ user: ResolvedGoogleUser; isNew: boolean }> {
    const existing = await this.prisma.user.findFirst({
      where: { email: payload.email, status: { not: UserStatus.DELETED } },
      include: { roles: { include: { role: true } } },
    });

    if (existing) {
      if (existing.status === UserStatus.BLOCKED) {
        throw new ForbiddenException({
          code: ApiErrorCode.USER_BLOCKED,
          message: 'Account is blocked',
        });
      }
      const updated = await this.prisma.user.update({
        where: { id: existing.id },
        data: { isEmailVerified: true, lastLoginAt: new Date() },
        include: { roles: { include: { role: true } } },
      });
      return { user: this.toResolved(updated), isNew: false };
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const first = payload.name?.split(' ')[0] ?? null;
      const last = payload.name?.split(' ').slice(1).join(' ') || null;
      const user = await tx.user.create({
        data: {
          email: payload.email,
          isEmailVerified: true,
          lastLoginAt: new Date(),
          profile: {
            create: {
              firstName: first,
              lastName: last,
              displayName: payload.name ?? null,
              avatarUrl: payload.picture ?? null,
            },
          },
        },
      });
      const role = await tx.role.findUnique({
        where: { code: UserRole.USER },
        select: { id: true },
      });
      if (role) {
        await tx.userRole.create({ data: { userId: user.id, roleId: role.id } });
      }
      return tx.user.findUniqueOrThrow({
        where: { id: user.id },
        include: { roles: { include: { role: true } } },
      });
    });

    return { user: this.toResolved(created), isNew: true };
  }

  private toResolved(user: {
    id: string;
    phone: string | null;
    email: string | null;
    defaultLanguage: Language;
    status: UserStatus;
    isPhoneVerified: boolean;
    isEmailVerified: boolean;
    roles: { role: { code: string } }[];
  }): ResolvedGoogleUser {
    return {
      id: user.id,
      phone: user.phone,
      email: user.email,
      defaultLanguage: user.defaultLanguage,
      status: user.status,
      isPhoneVerified: user.isPhoneVerified,
      isEmailVerified: user.isEmailVerified,
      roles: user.roles.map((r) => r.role.code),
    };
  }
}
```

- [ ] **Step 7: Run, verify pass.**

Run: `rtk pnpm --filter @avino/api test -- google-auth.service`
Expected: PASS (5 tests).

- [ ] **Step 8: Commit.**

```bash
git add apps/api/package.json apps/api/src/common/dto/error-response.dto.ts apps/api/src/auth/dto/google-login.dto.ts apps/api/src/auth/google-auth.service.ts apps/api/src/auth/google-auth.service.spec.ts
git commit -m "feat(api): GoogleAuthService (verify ID-token, resolve by email)"
```
(If pnpm-lock changed, add it too.)

---

## Task 8: POST /auth/google endpoint + module wiring (TDD)

**Files:**
- Modify: `apps/api/src/auth/auth.controller.ts`
- Modify: `apps/api/src/auth/auth.module.ts`
- Modify: `apps/api/src/auth/auth.controller.spec.ts`

- [ ] **Step 1: Add failing controller test** to `auth.controller.spec.ts`:

```ts
it('POST google delegates to GoogleAuthService.login', async () => {
  const result = { access_token: 'a' };
  googleAuthService.login.mockResolvedValue(result);
  const res = await controller.google({ id_token: 't' } as never, '1.1.1.1', 'UA');
  expect(googleAuthService.login).toHaveBeenCalledWith({ id_token: 't' }, '1.1.1.1', 'UA');
  expect(res).toBe(result);
});
```

In the spec setup add `const googleAuthService = { login: jest.fn() };` and pass it into the `new AuthController(otpService, authService, googleAuthService)` call.

- [ ] **Step 2: Run, verify it fails.**

Run: `rtk pnpm --filter @avino/api test -- auth.controller`
Expected: FAIL (arity / method missing).

- [ ] **Step 3: Implement in `auth.controller.ts`.** Add imports:

```ts
import { GoogleAuthService } from './google-auth.service';
import { GoogleLoginDto } from './dto/google-login.dto';
```

Add constructor param:
```ts
    private readonly authService: AuthService,
    private readonly googleAuthService: GoogleAuthService,
```

Add endpoint (after `verifyOtp`):
```ts
  /**
   * Вход через Google (public). Принимает Google ID-token (GIS на клиенте),
   * верифицирует офлайн, создаёт пользователя при первом входе (login=signup),
   * выдаёт ту же сессию, что и OTP-verify. Провайдер не настроен → 503.
   */
  @Post('google')
  @HttpCode(HttpStatus.OK)
  google(
    @Body() dto: GoogleLoginDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ): Promise<VerifyOtpResult> {
    return this.googleAuthService.login(dto, ip, userAgent);
  }
```

- [ ] **Step 4: Register provider in `auth.module.ts`.** Add import + add `GoogleAuthService` to `providers`:

```ts
import { GoogleAuthService } from './google-auth.service';
// providers: [OtpService, OtpRateLimitService, AuthService, TokenService, GoogleAuthService],
```

- [ ] **Step 5: Run, verify pass + build.**

Run: `rtk pnpm --filter @avino/api test -- auth.controller`
Expected: PASS.
Run: `rtk pnpm --filter @avino/api build`
Expected: succeeds.

- [ ] **Step 6: Commit.**

```bash
git add apps/api/src/auth/auth.controller.ts apps/api/src/auth/auth.module.ts apps/api/src/auth/auth.controller.spec.ts
git commit -m "feat(api): POST /auth/google endpoint"
```

---

## Task 9: Admin runtime toggle /admin/telegram-settings (TDD)

**Files:**
- Create: `apps/api/src/admin/dto/update-telegram-settings.dto.ts`
- Create: `apps/api/src/admin/admin-telegram-settings.service.ts`
- Create: `apps/api/src/admin/admin-telegram-settings.controller.ts`
- Test: `apps/api/src/admin/admin-telegram-settings.service.spec.ts`
- Modify: `apps/api/src/admin/admin.module.ts`

- [ ] **Step 1: Write failing test `admin-telegram-settings.service.spec.ts`.**

```ts
import { AdminTelegramSettingsService } from './admin-telegram-settings.service';

describe('AdminTelegramSettingsService', () => {
  const prisma = {
    appSetting: { findUnique: jest.fn(), upsert: jest.fn() },
    auditLog: { create: jest.fn() },
  };
  const config = { get: jest.fn().mockReturnValue(false) }; // env default false
  let service: AdminTelegramSettingsService;

  beforeEach(() => {
    jest.resetAllMocks();
    config.get.mockReturnValue(false);
    service = new AdminTelegramSettingsService(prisma as never, config as never);
  });

  it('get() returns stored value over env default', async () => {
    prisma.appSetting.findUnique.mockResolvedValue({ value: 'true' });
    expect(await service.get()).toEqual({ notificationsEnabled: true });
  });

  it('get() falls back to env default when unset', async () => {
    prisma.appSetting.findUnique.mockResolvedValue(null);
    expect(await service.get()).toEqual({ notificationsEnabled: false });
  });

  it('update() upserts string value + writes audit', async () => {
    await service.update('admin1', { enabled: true });
    expect(prisma.appSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: 'telegram_notifications_enabled' },
        update: { value: 'true' },
        create: { key: 'telegram_notifications_enabled', value: 'true' },
      }),
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorId: 'admin1',
          action: 'TELEGRAM_SETTINGS_UPDATE',
          metadata: { enabled: true },
        }),
      }),
    );
  });
});
```

- [ ] **Step 2: Run, verify it fails.**

Run: `rtk pnpm --filter @avino/api test -- admin-telegram-settings`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Create DTO `dto/update-telegram-settings.dto.ts`.**

```ts
import { IsBoolean } from 'class-validator';

/** Тело `PATCH /api/v1/admin/telegram-settings`. */
export class UpdateTelegramSettingsDto {
  @IsBoolean()
  enabled!: boolean;
}
```

- [ ] **Step 4: Create service `admin-telegram-settings.service.ts`.**

```ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma';
import {
  TELEGRAM_NOTIFICATIONS_ENABLED_KEY,
  resolveNotificationsEnabled,
} from '../telegram';
import { UpdateTelegramSettingsDto } from './dto/update-telegram-settings.dto';

export interface TelegramSettingsView {
  notificationsEnabled: boolean;
}

/**
 * Runtime-тоггл Telegram-алертов (ADMIN). Хранит булеву строку в app_settings,
 * читается TelegramService на каждом алерте — переключение без пересборки.
 */
@Injectable()
export class AdminTelegramSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async get(): Promise<TelegramSettingsView> {
    const envDefault =
      this.config.get<boolean>('telegram.notificationStateDefault') ?? false;
    const row = await this.prisma.appSetting.findUnique({
      where: { key: TELEGRAM_NOTIFICATIONS_ENABLED_KEY },
    });
    return {
      notificationsEnabled: resolveNotificationsEnabled(row?.value, envDefault),
    };
  }

  async update(
    adminId: string,
    dto: UpdateTelegramSettingsDto,
  ): Promise<TelegramSettingsView> {
    const value = String(dto.enabled);
    await this.prisma.appSetting.upsert({
      where: { key: TELEGRAM_NOTIFICATIONS_ENABLED_KEY },
      update: { value },
      create: { key: TELEGRAM_NOTIFICATIONS_ENABLED_KEY, value },
    });
    await this.prisma.auditLog.create({
      data: {
        actorId: adminId,
        action: 'TELEGRAM_SETTINGS_UPDATE',
        entityType: 'app_setting',
        entityId: null,
        metadata: { enabled: dto.enabled },
      },
    });
    return { notificationsEnabled: dto.enabled };
  }
}
```

- [ ] **Step 5: Create controller `admin-telegram-settings.controller.ts`.**

```ts
import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { UserRole } from '@avino/shared';
import { CurrentUser, Roles } from '../common/decorators';
import { JwtAuthGuard, RolesGuard } from '../common/guards';
import { AdminTelegramSettingsService } from './admin-telegram-settings.service';
import { UpdateTelegramSettingsDto } from './dto/update-telegram-settings.dto';

@Controller({ path: 'admin/telegram-settings', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminTelegramSettingsController {
  constructor(private readonly service: AdminTelegramSettingsService) {}

  @Get()
  get() {
    return this.service.get();
  }

  @Patch()
  update(
    @CurrentUser('id') adminId: string,
    @Body() dto: UpdateTelegramSettingsDto,
  ) {
    return this.service.update(adminId, dto);
  }
}
```

- [ ] **Step 6: Register in `admin.module.ts`.** Add imports for the new controller/service, add controller to `controllers`, service to `providers`.

- [ ] **Step 7: Run, verify pass + build.**

Run: `rtk pnpm --filter @avino/api test -- admin-telegram-settings`
Expected: PASS (3 tests).
Run: `rtk pnpm --filter @avino/api build`
Expected: succeeds.

- [ ] **Step 8: Run full api test suite + lint (regression gate).**

Run: `rtk pnpm --filter @avino/api test`
Expected: all suites PASS.
Run: `rtk pnpm --filter @avino/api lint`
Expected: no errors.

- [ ] **Step 9: Commit.**

```bash
git add apps/api/src/admin/admin-telegram-settings.controller.ts apps/api/src/admin/admin-telegram-settings.service.ts apps/api/src/admin/admin-telegram-settings.service.spec.ts apps/api/src/admin/dto/update-telegram-settings.dto.ts apps/api/src/admin/admin.module.ts
git commit -m "feat(api): ADMIN runtime toggle GET/PATCH /admin/telegram-settings"
```

---

## Task 10: Client — googleLogin mutation

**Files:**
- Modify: `apps/client/src/store/api/authApi.ts`

- [ ] **Step 1: Add the mutation.** After `verifyOtp` in `injectEndpoints`, add:

```ts
    googleLogin: build.mutation<VerifyOtpResponse, { id_token: string }>({
      query: (body) => ({
        url: '/auth/google',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Auth', 'User'],
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          dispatch(
            setCredentials({
              access_token: data.access_token,
              refresh_token: data.refresh_token,
              user: data.user,
            }),
          );
        } catch {
          /* ошибку показывает UI */
        }
      },
    }),
```

And add `useGoogleLoginMutation` to the exported hooks list at the bottom.

- [ ] **Step 2: Verify typecheck/lint.**

Run: `rtk pnpm --filter @avino/shared build && rtk pnpm --filter @avino/client lint`
Expected: no errors.

- [ ] **Step 3: Commit.**

```bash
git add apps/client/src/store/api/authApi.ts
git commit -m "feat(client): googleLogin mutation"
```

---

## Task 11: Client — GoogleSignInButton + LoginModal + i18n

**Files:**
- Create: `apps/client/src/components/layout/GoogleSignInButton.tsx`
- Modify: `apps/client/src/components/layout/LoginModal.tsx`
- Modify: `apps/client/messages/ru.json`, `uz.json`, `en.json`

- [ ] **Step 1: Add i18n keys.** In each `messages/*.json`, add to the `auth` object (after `close`):

ru.json:
```json
    "or": "или",
    "continueWithGoogle": "Войти через Google",
```
uz.json:
```json
    "or": "yoki",
    "continueWithGoogle": "Google orqali kirish",
```
en.json:
```json
    "or": "or",
    "continueWithGoogle": "Continue with Google",
```
(Ensure the preceding line gets a trailing comma.)

- [ ] **Step 2: Create `GoogleSignInButton.tsx`.**

```tsx
/**
 * GoogleSignInButton — официальная кнопка Google Identity Services (GIS).
 * Грузит gsi-скрипт, рендерит кнопку, в callback шлёт ID-token на /auth/google
 * через googleLogin. Рендерится только если задан NEXT_PUBLIC_GOOGLE_CLIENT_ID.
 */
'use client';

import * as React from 'react';
import { useGoogleLoginMutation } from '@/store/api/authApi';

interface GoogleIdConfig {
  client_id: string;
  callback: (resp: { credential: string }) => void;
}
interface GoogleButtonOptions {
  theme: string;
  size: string;
  width: number;
  text: string;
}
declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (cfg: GoogleIdConfig) => void;
          renderButton: (el: HTMLElement, opts: GoogleButtonOptions) => void;
        };
      };
    };
  }
}

const GSI_SRC = 'https://accounts.google.com/gsi/client';

export function GoogleSignInButton({ onSuccess }: { onSuccess?: () => void }) {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [googleLogin] = useGoogleLoginMutation();

  React.useEffect(() => {
    if (!clientId || !containerRef.current) return;

    const render = () => {
      if (!window.google || !containerRef.current) return;
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: async (resp) => {
          try {
            await googleLogin({ id_token: resp.credential }).unwrap();
            onSuccess?.();
          } catch {
            /* ошибку показывает родитель/RTK */
          }
        },
      });
      window.google.accounts.id.renderButton(containerRef.current, {
        theme: 'outline',
        size: 'large',
        width: 356,
        text: 'continue_with',
      });
    };

    if (window.google) {
      render();
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${GSI_SRC}"]`,
    );
    if (existing) {
      existing.addEventListener('load', render);
      return () => existing.removeEventListener('load', render);
    }
    const script = document.createElement('script');
    script.src = GSI_SRC;
    script.async = true;
    script.defer = true;
    script.onload = render;
    document.head.appendChild(script);
  }, [clientId, googleLogin, onSuccess]);

  if (!clientId) return null;
  return <div ref={containerRef} className="mt-3 flex justify-center" />;
}
```

- [ ] **Step 3: Mount in `LoginModal.tsx`.** Add import:

```tsx
import { GoogleSignInButton } from './GoogleSignInButton';
```

In step 1 block, after the `requestCode` `<Button>`, add divider + button:

```tsx
              <div className="mt-4 flex items-center gap-3 text-[12px] text-muted-foreground">
                <span className="h-px flex-1 bg-border" />
                {t('or')}
                <span className="h-px flex-1 bg-border" />
              </div>
              <GoogleSignInButton onSuccess={() => onOpenChange(false)} />
```

- [ ] **Step 4: Verify typecheck/lint + build.**

Run: `rtk pnpm --filter @avino/shared build && rtk pnpm --filter @avino/client lint && rtk pnpm --filter @avino/client build`
Expected: no errors; build succeeds.

- [ ] **Step 5: Commit.**

```bash
git add apps/client/src/components/layout/GoogleSignInButton.tsx apps/client/src/components/layout/LoginModal.tsx apps/client/messages/ru.json apps/client/messages/uz.json apps/client/messages/en.json
git commit -m "feat(client): Google sign-in button in LoginModal"
```

---

## Task 12: Web admin — telegram-settings API + toggle island

**Files:**
- Create: `apps/web/src/store/api/adminTelegramSettingsApi.ts`
- Create: `apps/web/src/components/admin/TelegramNotificationsToggle.tsx`
- Modify: `apps/web/src/app/admin/settings/page.tsx`

- [ ] **Step 1: Create `adminTelegramSettingsApi.ts`.**

```ts
import { adminApi } from './adminApi';

export interface TelegramSettings {
  notificationsEnabled: boolean;
}

/**
 * adminTelegramSettingsApi — runtime-тоггл Telegram-алертов (ADMIN).
 * GET/PATCH /admin/telegram-settings. Инвалидирует тег Admin.
 */
export const adminTelegramSettingsApi = adminApi.injectEndpoints({
  endpoints: (build) => ({
    getTelegramSettings: build.query<TelegramSettings, void>({
      query: () => ({ url: '/admin/telegram-settings' }),
      providesTags: ['Admin'],
    }),
    updateTelegramSettings: build.mutation<TelegramSettings, { enabled: boolean }>({
      query: (body) => ({
        url: '/admin/telegram-settings',
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['Admin'],
    }),
  }),
  overrideExisting: false,
});

export const {
  useGetTelegramSettingsQuery,
  useUpdateTelegramSettingsMutation,
} = adminTelegramSettingsApi;
```

- [ ] **Step 2: Create `TelegramNotificationsToggle.tsx`.**

```tsx
/**
 * Runtime-переключатель Telegram-алертов на странице настроек (ADMIN).
 * Client-island: читает текущее состояние и шлёт PATCH без пересборки.
 */
'use client';

import {
  useGetTelegramSettingsQuery,
  useUpdateTelegramSettingsMutation,
} from '@/store/api/adminTelegramSettingsApi';

export function TelegramNotificationsToggle() {
  const { data, isLoading } = useGetTelegramSettingsQuery();
  const [update, { isLoading: isSaving }] = useUpdateTelegramSettingsMutation();
  const enabled = data?.notificationsEnabled ?? false;

  return (
    <div className="a-card" style={{ padding: 24, maxWidth: 640, marginTop: 18 }}>
      <div className="row gap-16" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14.5 }}>Telegram-уведомления админу</div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
            Алерты на запрос OTP и входы. Переключается без пересборки.
          </div>
        </div>
        <button
          type="button"
          className={enabled ? 'abtn abtn-primary' : 'abtn'}
          disabled={isLoading || isSaving}
          onClick={() => void update({ enabled: !enabled })}
        >
          {isLoading ? '…' : enabled ? 'Включено' : 'Выключено'}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Mount in `settings/page.tsx`.** Add import at top and render the island after the existing static card (inside the outer `<div>`):

```tsx
import { TelegramNotificationsToggle } from '@/components/admin/TelegramNotificationsToggle';
// ... after the closing </div> of the static a-card, before the outer </div>:
        <TelegramNotificationsToggle />
```

- [ ] **Step 4: Verify typecheck/lint + build.**

Run: `rtk pnpm --filter @avino/shared build && rtk pnpm --filter @avino/web lint && rtk pnpm --filter @avino/web build`
Expected: no errors; build succeeds.

- [ ] **Step 5: Commit.**

```bash
git add apps/web/src/store/api/adminTelegramSettingsApi.ts apps/web/src/components/admin/TelegramNotificationsToggle.tsx apps/web/src/app/admin/settings/page.tsx
git commit -m "feat(web): runtime toggle for Telegram alerts on admin settings"
```

---

## Task 13: Docs — ENV, API, ADR, DONE

**Files:**
- Modify: `docs/ENV.md`, `docs/API.md`, `docs/DONE.md`
- Create: `docs/adr/ADR-00XX-google-auth-telegram-alerts.md` (next free number)

- [ ] **Step 1: ENV.md.** Document new api vars (`GOOGLE_CLIENT_ID`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ADMIN_CHAT_ID`, `TELEGRAM_INCLUDE_OTP_CODE` default `true`, `TELEGRAM_NOTIFICATION_STATE` default dev=true/prod=false) and client var `NEXT_PUBLIC_GOOGLE_CLIENT_ID`. Match the existing table/section style.

- [ ] **Step 2: API.md.** Add `POST /auth/google` (body `{ id_token }`, same response as `otp/verify`), `GET`/`PATCH /admin/telegram-settings` (ADMIN), and the `AUTH_PROVIDER_UNAVAILABLE` code to the §17 error catalog.

- [ ] **Step 3: ADR.** Create `docs/adr/ADR-00XX-google-auth-telegram-alerts.md` (find next number via `ls docs/adr`). Record: Google account-linking by verified email (no `googleId` migration — future), `google-auth-library` offline verification, Telegram best-effort fire-and-forget alerts with code (flag-gated), two-layer enabled toggle (env default + `app_settings` runtime override), `AUTH_PROVIDER_UNAVAILABLE`.

- [ ] **Step 4: DONE.md.** Add an entry summarizing the feature with the task IDs/files, following the existing DONE.md format.

- [ ] **Step 5: Commit.**

```bash
git add docs/ENV.md docs/API.md docs/DONE.md docs/adr/
git commit -m "docs(auth): Google sign-in, Telegram alerts, runtime toggle (ADR + ENV + API + DONE)"
```

---

## Task 14: Live verification (run in a fresh session with Docker)

> Per the user: live run happens in a new session. This is a manual checklist, not code. Credentials are config-gated; OTP is verified via the dev-log fallback.

- [ ] **Step 1: Bring up the stack.** `rtk pnpm stack:up` (docker compose `--profile app`). Wait for `migrate`, `api`, `web`, `client` healthy.
- [ ] **Step 2: OTP request.** `POST /api/v1/auth/otp/request` `{ "channel": "SMS", "destination": "+998901234567" }`. Read the 6-digit code from api logs (`[DEV SMS → ...]`) and confirm the `[DEV Telegram → admin]` request alert appears (env default dev=true).
- [ ] **Step 3: OTP verify.** `POST /api/v1/auth/otp/verify` with the code → expect `access_token`/`refresh_token`/`user`. Confirm `[DEV Telegram → admin] ✅ ... зарегистрирован новый пользователь`.
- [ ] **Step 4: /auth/me.** `GET /api/v1/auth/me` with the Bearer access token → expect contract body with `roles: ["USER"]`.
- [ ] **Step 5: Failed verify alert.** `POST /auth/otp/verify` with a wrong code → 400 `OTP_INVALID`; confirm `[DEV Telegram → admin] ⚠️ ... OTP_INVALID`.
- [ ] **Step 6: Google not configured.** `POST /api/v1/auth/google` `{ "id_token": "x" }` → expect `503 AUTH_PROVIDER_UNAVAILABLE`.
- [ ] **Step 7: Runtime toggle.** As an ADMIN (seed/grant), `PATCH /api/v1/admin/telegram-settings { "enabled": false }`; repeat Step 2 → no Telegram dev-log line. `PATCH { "enabled": true }` restores it.
- [ ] **Step 8: Real creds (when provided).** Put `GOOGLE_CLIENT_ID` + `NEXT_PUBLIC_GOOGLE_CLIENT_ID` + `TELEGRAM_BOT_TOKEN` + `TELEGRAM_ADMIN_CHAT_ID` in `.env`; restart; verify a real Telegram message arrives and the client Google button completes a real sign-in.

---

## Self-Review

- **Spec coverage:** Google endpoint+service (T7/T8), client button (T10/T11), OTP live verify (T14), Telegram transport (T4) + formatters (T3) + request/success/fail hooks (T5/T6) + Google-login alert (T7), two-layer toggle (T1 env + T2 resolver + T9 admin endpoint + T12 web UI), config/env (T1), error code (T7), docs (T13). All spec §3–§8 items mapped. ✓
- **Placeholders:** none — every code step has full code; ADR number is the only deferred value (resolved via `ls docs/adr` in T13 Step 3). ✓
- **Type consistency:** `sendAdminAlert`/`isEnabled` (TelegramService), `resolveNotificationsEnabled` + `TELEGRAM_NOTIFICATIONS_ENABLED_KEY` (constants, used in T2/T4/T9), `formatOtpRequest`/`formatLoginSuccess`/`formatLoginFailed` (util, used in T5/T6/T7), `VerifyOtpResult` (reused by GoogleAuthService), `ResolvedUser.isNew` (T6) — names consistent across tasks. ✓
