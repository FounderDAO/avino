# Sign in with Apple — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить «Вход через Apple» (Sign in with Apple) на публичный портал, зеркально существующему Google-входу.

**Architecture:** `POST /api/v1/auth/apple` (NestJS) верифицирует Apple ID-token офлайн (только Service ID как audience, без приватного ключа Apple), линкует/создаёт пользователя по верифицированному email (как ADR-0065, без миграции БД), выдаёт сессию общим `TokenService`, пишет audit + Telegram-алерт. Клиент (`apps/client`) рендерит кнопку Apple под Google в `LoginModal`. Всё config-gated: нет `APPLE_CLIENT_ID` → `503`, нет `NEXT_PUBLIC_APPLE_CLIENT_ID` → кнопка скрыта.

**Tech Stack:** NestJS, Prisma, `apple-signin-auth` (верификация ID-token), Next.js + RTK Query, Sign in with Apple JS, next-intl, Jest.

**Spec:** `docs/superpowers/specs/2026-06-19-apple-sign-in-design.md`

## Global Constraints

- **RTK обязателен** для всех bash-команд (хук переписывает автоматически).
- **`main` защищён** — никогда не мержить через `gh ... --admin`; открыть PR, мержит пользователь. Все git-операции делает контроллер, субагенты git НЕ трогают.
- **Границы папок:** backend-изменения только в `apps/api`, клиент — только в `apps/client`. `apps/web` (админка) НЕ трогаем.
- **API-контракт:** тело/поля в `snake_case`, enum-значения UPPERCASE (как в `docs/API.md`).
- **i18n:** ключи добавляются с паритетом RU/UZ/EN; один писатель JSON-файлов.
- **Никаких дефолтов для секретов**; новые env опциональны на старте (`@IsOptional`).
- **Config-gating** идентичен Google: без креды приложение работает без изменений.
- **OpenAPI drift-check в CI:** при добавлении роута `apps/api/openapi.public.json` и `openapi.internal.json` ОБЯЗАТЕЛЬНО регенерировать и закоммитить, иначе `git diff --exit-code` в CI упадёт.
- Ветка работы: `feat/apple-sign-in` (уже создана, спек закоммичен).

---

## File Structure

**Backend (`apps/api`):**
- Create: `src/auth/apple-auth.service.ts` — верификация Apple ID-token + resolve/create по email + выпуск сессии.
- Create: `src/auth/apple-auth.service.spec.ts` — unit-тесты сервиса.
- Create: `src/auth/dto/apple-login.dto.ts` — тело запроса.
- Modify: `src/config/configuration.ts` — `appleConfig` + регистрация в массиве.
- Modify: `src/config/env.validation.ts` — `APPLE_CLIENT_ID`.
- Modify: `src/telegram/auth-alert.util.ts` — расширить тип `provider`.
- Modify: `src/auth/auth.controller.ts` — роут `POST apple`.
- Modify: `src/auth/auth.module.ts` — провайдер `AppleAuthService`.

**Client (`apps/client`):**
- Create: `src/components/layout/AppleSignInButton.tsx` — кнопка Apple JS.
- Modify: `src/store/api/authApi.ts` — мутация `appleLogin` + хук.
- Modify: `src/components/layout/LoginModal.tsx` — рендер кнопки + импорт.
- Modify: `messages/ru.json`, `messages/uz.json`, `messages/en.json` — ключ `continueWithApple`.

**Docs:**
- Modify: `docs/API.md` — раздел `POST /api/v1/auth/apple`.
- Modify: `docs/ENV.md` — `APPLE_CLIENT_ID`, `NEXT_PUBLIC_APPLE_*`.
- Modify: `apps/api/src/common/openapi/swagger.documents.ts` — упомянуть Apple в описании.
- Regenerate: `apps/api/openapi.public.json`, `apps/api/openapi.internal.json`.
- Create: `docs/adr/ADR-0097-sign-in-with-apple.md`.
- Modify: `docs/DONE.md` — запись о фиче.

---

## Task 1: Backend — `POST /api/v1/auth/apple`

**Files:**
- Create: `apps/api/src/auth/apple-auth.service.ts`
- Create: `apps/api/src/auth/dto/apple-login.dto.ts`
- Create: `apps/api/src/auth/apple-auth.service.spec.ts`
- Modify: `apps/api/src/config/configuration.ts:162-208`
- Modify: `apps/api/src/config/env.validation.ts:250-253`
- Modify: `apps/api/src/telegram/auth-alert.util.ts:37`
- Modify: `apps/api/src/auth/auth.controller.ts`
- Modify: `apps/api/src/auth/auth.module.ts`

**Interfaces:**
- Consumes: `TokenService.issueSession({ userId, roles, ip, userAgent }) → { accessToken, refreshToken, expiresIn }`; `formatLoginSuccess(LoginSuccessAlert)`; `TelegramService.sendAdminAlert(text)`; `PrismaService`; `ApiErrorCode`; `VerifyOtpResult` (из `./auth.service`).
- Produces: `AppleAuthService.login(dto: AppleLoginDto, ip?: string, userAgent?: string): Promise<VerifyOtpResult>`; route `POST /api/v1/auth/apple`; config-key `apple.clientIds: string[]`.

- [ ] **Step 1: Установить зависимость и проверить API пакета**

```bash
pnpm --filter @avino/api add apple-signin-auth
pnpm --filter @avino/api exec node -e "const a=require('apple-signin-auth'); console.log(typeof a.verifyIdToken)"
```
Expected: печатает `function`. (Если пакет не поставляет типы — добавить в `apps/api/src/types/` файл `apple-signin-auth.d.ts` с `declare module 'apple-signin-auth';`; проверится на шаге build.)

- [ ] **Step 2: Добавить `appleConfig` в `configuration.ts`**

После блока `googleConfig` (строки 160-164) вставить:
```typescript
// Sign in with Apple (passwordless вход публичного портала). clientIds опциональны
// на старте — без них /auth/apple отдаёт 503 AUTH_PROVIDER_UNAVAILABLE. CSV
// разрешённых audience (Service ID веба; в будущем + bundle ID нативного app).
export const appleConfig = registerAs('apple', () => ({
  clientIds: (process.env.APPLE_CLIENT_ID ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
}));
```
И в массив конфигов (строки 203-205) добавить `appleConfig,` сразу после `googleConfig,`:
```typescript
  jwtConfig,
  googleConfig,
  appleConfig,
  telegramConfig,
```

- [ ] **Step 3: Добавить `APPLE_CLIENT_ID` в `env.validation.ts`**

После блока `GOOGLE_CLIENT_ID` (строки 250-253) вставить:
```typescript
  // ── Sign in with Apple (опционально на старте) ──
  @IsString()
  @IsOptional()
  APPLE_CLIENT_ID?: string;
```

- [ ] **Step 4: Создать DTO `apps/api/src/auth/dto/apple-login.dto.ts`**

```typescript
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * Тело `POST /api/v1/auth/apple` — ID-token из Sign in with Apple JS.
 * Имя Apple отдаёт ТОЛЬКО при первой авторизации (поле `user`, не в токене),
 * поэтому first/last опциональны и используются лишь для посева профиля.
 */
export class AppleLoginDto {
  @IsString()
  @IsNotEmpty()
  id_token!: string;

  @IsString()
  @IsOptional()
  first_name?: string;

  @IsString()
  @IsOptional()
  last_name?: string;
}
```

- [ ] **Step 5: Расширить тип `provider` в `telegram/auth-alert.util.ts`**

Строка 37 — заменить:
```typescript
  provider?: 'GOOGLE';
```
на:
```typescript
  provider?: 'GOOGLE' | 'APPLE';
```

- [ ] **Step 6: Написать падающий тест `apps/api/src/auth/apple-auth.service.spec.ts`**

```typescript
import { AppleAuthService } from './apple-auth.service';

const verifyIdToken = jest.fn();
jest.mock('apple-signin-auth', () => ({ verifyIdToken }));

function makeService(clientIds: string[], prismaOverrides: object = {}) {
  const config = {
    get: (k: string) => (k === 'apple.clientIds' ? clientIds : undefined),
  };
  const prisma: any = {
    user: {
      findFirst: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    role: { findUnique: jest.fn().mockResolvedValue({ id: 'r1' }) },
    userRole: { create: jest.fn() },
    auditLog: { create: jest.fn() },
    ...prismaOverrides,
  };
  prisma.$transaction = jest.fn(async (cb: any) => cb(prisma));
  const tokenService = {
    issueSession: jest
      .fn()
      .mockResolvedValue({ accessToken: 'a', refreshToken: 'r', expiresIn: 900 }),
  };
  const telegram = { sendAdminAlert: jest.fn().mockResolvedValue(undefined) };
  const service = new AppleAuthService(
    prisma as never,
    config as never,
    tokenService as never,
    telegram as never,
  );
  return { service, prisma, tokenService, telegram };
}

const EXISTING_USER = {
  id: 'u1',
  phone: null,
  email: 'a@b.com',
  defaultLanguage: 'RU',
  status: 'ACTIVE',
  isPhoneVerified: false,
  isEmailVerified: true,
  roles: [{ role: { code: 'USER' } }],
};

describe('AppleAuthService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('503 when APPLE_CLIENT_ID not configured', async () => {
    const { service } = makeService([]);
    await expect(service.login({ id_token: 't' })).rejects.toMatchObject({
      response: { code: 'AUTH_PROVIDER_UNAVAILABLE' },
    });
  });

  it('401 when token invalid', async () => {
    verifyIdToken.mockRejectedValue(new Error('bad'));
    const { service } = makeService(['CID']);
    await expect(service.login({ id_token: 't' })).rejects.toMatchObject({
      response: { code: 'UNAUTHORIZED' },
    });
  });

  it('401 when email not verified', async () => {
    verifyIdToken.mockResolvedValue({
      email: 'a@b.com',
      sub: 's',
      email_verified: false,
    });
    const { service } = makeService(['CID']);
    await expect(service.login({ id_token: 't' })).rejects.toMatchObject({
      response: { code: 'UNAUTHORIZED' },
    });
  });

  it('coerces string email_verified "true" and issues session for existing user', async () => {
    verifyIdToken.mockResolvedValue({
      email: 'a@b.com',
      sub: 's',
      email_verified: 'true',
    });
    const { service, prisma, tokenService } = makeService(['CID']);
    prisma.user.findFirst.mockResolvedValue(EXISTING_USER);
    prisma.user.update.mockResolvedValue(EXISTING_USER);
    const res = await service.login({ id_token: 't' }, '1.1.1.1', 'UA');
    expect(tokenService.issueSession).toHaveBeenCalled();
    expect(res.access_token).toBe('a');
    expect(res.user.email).toBe('a@b.com');
  });

  it('403 when user blocked', async () => {
    verifyIdToken.mockResolvedValue({
      email: 'a@b.com',
      sub: 's',
      email_verified: true,
    });
    const { service, prisma } = makeService(['CID']);
    prisma.user.findFirst.mockResolvedValue({
      ...EXISTING_USER,
      status: 'BLOCKED',
    });
    await expect(service.login({ id_token: 't' })).rejects.toMatchObject({
      response: { code: 'USER_BLOCKED' },
    });
  });

  it('creates a new user seeding profile name from DTO', async () => {
    verifyIdToken.mockResolvedValue({
      email: 'new@b.com',
      sub: 's',
      email_verified: true,
    });
    const { service, prisma } = makeService(['CID']);
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({ id: 'u2' });
    prisma.user.findUniqueOrThrow.mockResolvedValue({
      ...EXISTING_USER,
      id: 'u2',
      email: 'new@b.com',
    });
    const res = await service.login({
      id_token: 't',
      first_name: 'New',
      last_name: 'User',
    });
    expect(prisma.user.create).toHaveBeenCalled();
    const createArg = prisma.user.create.mock.calls[0][0];
    expect(createArg.data.profile.create.displayName).toBe('New User');
    expect(res.user.id).toBe('u2');
  });
});
```

- [ ] **Step 7: Запустить тест — убедиться, что падает**

```bash
pnpm --filter @avino/api exec jest src/auth/apple-auth.service.spec.ts
```
Expected: FAIL — `Cannot find module './apple-auth.service'` (сервис ещё не создан).

- [ ] **Step 8: Реализовать `apps/api/src/auth/apple-auth.service.ts`**

```typescript
import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Language, UserStatus } from '@prisma/client';
import appleSignin from 'apple-signin-auth';
import { UserRole } from '@avino/shared';
import { ApiErrorCode } from '../common/dto/error-response.dto';
import { PrismaService } from '../prisma';
import { TelegramService, formatLoginSuccess } from '../telegram';
import { VerifyOtpResult } from './auth.service';
import { TokenService } from './token.service';
import { AppleLoginDto } from './dto/apple-login.dto';

interface ApplePayload {
  email: string;
  emailVerified: boolean;
  sub: string;
  firstName: string | null;
  lastName: string | null;
}

interface ResolvedAppleUser {
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
 * AppleAuthService — passwordless вход через Apple ID (Sign in with Apple).
 *
 * Верификация ID-token офлайн через apple-signin-auth (подпись по JWKS Apple,
 * aud ∈ APPLE_CLIENT_ID, exp); связывание по верифицированному email (как
 * GoogleAuthService/ADR-0065). Логин=signup. Сессия — общим TokenService.
 * Провайдер не настроен (нет APPLE_CLIENT_ID) → 503 AUTH_PROVIDER_UNAVAILABLE.
 */
@Injectable()
export class AppleAuthService {
  private readonly logger = new Logger(AppleAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly tokenService: TokenService,
    private readonly telegram: TelegramService,
  ) {}

  async login(
    dto: AppleLoginDto,
    ip?: string,
    userAgent?: string,
  ): Promise<VerifyOtpResult> {
    const clientIds = this.config.get<string[]>('apple.clientIds');
    if (!clientIds || clientIds.length === 0) {
      throw new HttpException(
        {
          code: ApiErrorCode.AUTH_PROVIDER_UNAVAILABLE,
          message: 'Apple sign-in is not configured',
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const verified = await this.verifyToken(dto.id_token, clientIds);
    if (!verified.emailVerified) {
      throw new HttpException(
        {
          code: ApiErrorCode.UNAUTHORIZED,
          message: 'Apple email is not verified',
        },
        HttpStatus.UNAUTHORIZED,
      );
    }

    const payload: ApplePayload = {
      ...verified,
      firstName: dto.first_name?.trim() || null,
      lastName: dto.last_name?.trim() || null,
    };

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
        metadata: { provider: 'APPLE' },
      },
    });

    // Admin-алерт об успешном входе (best-effort, fire-and-forget).
    void this.telegram.sendAdminAlert(
      formatLoginSuccess({
        destination: user.email,
        ip,
        isNewUser: isNew,
        roles: user.roles,
        provider: 'APPLE',
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
    clientIds: string[],
  ): Promise<Omit<ApplePayload, 'firstName' | 'lastName'>> {
    try {
      const p = await appleSignin.verifyIdToken(idToken, {
        audience: clientIds,
        ignoreExpiration: false,
      });
      if (!p?.email || !p.sub) {
        throw new Error('Apple payload missing email/sub');
      }
      // Apple отдаёт email_verified / is_private_email иногда строкой "true".
      const emailVerified = p.email_verified === true || p.email_verified === 'true';
      return {
        email: p.email.toLowerCase(),
        emailVerified,
        sub: p.sub,
      };
    } catch (err) {
      this.logger.warn(
        `Apple token verification failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      throw new HttpException(
        { code: ApiErrorCode.UNAUTHORIZED, message: 'Invalid Apple token' },
        HttpStatus.UNAUTHORIZED,
      );
    }
  }

  /**
   * Найти активного (не-DELETED) пользователя по email или создать нового
   * (логин=signup). Email помечается verified; имя профиля — из DTO (Apple даёт
   * имя только при первой авторизации), иначе пусто.
   */
  private async resolveByEmail(
    payload: ApplePayload,
  ): Promise<{ user: ResolvedAppleUser; isNew: boolean }> {
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
      const displayName =
        [payload.firstName, payload.lastName].filter(Boolean).join(' ') || null;
      const user = await tx.user.create({
        data: {
          email: payload.email,
          isEmailVerified: true,
          lastLoginAt: new Date(),
          profile: {
            create: {
              firstName: payload.firstName,
              lastName: payload.lastName,
              displayName,
              avatarUrl: null,
            },
          },
        },
      });
      const role = await tx.role.findUnique({
        where: { code: UserRole.USER },
        select: { id: true },
      });
      if (role) {
        await tx.userRole.create({
          data: { userId: user.id, roleId: role.id },
        });
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
  }): ResolvedAppleUser {
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

Примечание по типам: если для установленной версии `apple-signin-auth` TS ругается, что `audience` — только `string`, рантайм (`jsonwebtoken`) поддерживает массив; на unit-тесты (мок) это не влияет, поправится на шаге build (Step 11).

- [ ] **Step 9: Запустить тест — убедиться, что проходит**

```bash
pnpm --filter @avino/api exec jest src/auth/apple-auth.service.spec.ts
```
Expected: PASS (6 тестов зелёные).

- [ ] **Step 10: Подключить роут и провайдер**

В `apps/api/src/auth/auth.controller.ts` добавить импорты:
```typescript
import { AppleAuthService } from './apple-auth.service';
import { AppleLoginDto } from './dto/apple-login.dto';
```
В конструктор `AuthController` (после `googleAuthService`):
```typescript
    private readonly googleAuthService: GoogleAuthService,
    private readonly appleAuthService: AppleAuthService,
```
После метода `google()` (строки 73-81) добавить:
```typescript
  /**
   * Вход через Apple (public). Принимает Apple ID-token (Sign in with Apple JS),
   * верифицирует офлайн, создаёт пользователя при первом входе (login=signup),
   * выдаёт ту же сессию, что и OTP-verify. Провайдер не настроен → 503.
   */
  @Post('apple')
  @HttpCode(HttpStatus.OK)
  apple(
    @Body() dto: AppleLoginDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ): Promise<VerifyOtpResult> {
    return this.appleAuthService.login(dto, ip, userAgent);
  }
```
В `apps/api/src/auth/auth.module.ts` добавить импорт `import { AppleAuthService } from './apple-auth.service';` и в массив `providers` строку `AppleAuthService,` (рядом с `GoogleAuthService`).

- [ ] **Step 11: Полный прогон тестов + build**

```bash
pnpm --filter @avino/api exec jest && pnpm --filter @avino/api build
```
Expected: весь api-сьют зелёный (включая новые 6 тестов), `nest build` без ошибок TS.

- [ ] **Step 12: Commit**

```bash
git add apps/api/src/auth/apple-auth.service.ts apps/api/src/auth/apple-auth.service.spec.ts apps/api/src/auth/dto/apple-login.dto.ts apps/api/src/auth/auth.controller.ts apps/api/src/auth/auth.module.ts apps/api/src/config/configuration.ts apps/api/src/config/env.validation.ts apps/api/src/telegram/auth-alert.util.ts apps/api/package.json pnpm-lock.yaml
git commit -m "feat(api): POST /auth/apple — Sign in with Apple (mirror Google)"
```

---

## Task 2: Client — кнопка Apple в LoginModal

**Files:**
- Modify: `apps/client/messages/ru.json:85`, `messages/uz.json:85`, `messages/en.json:85`
- Modify: `apps/client/src/store/api/authApi.ts:138-160,203-211`
- Create: `apps/client/src/components/layout/AppleSignInButton.tsx`
- Modify: `apps/client/src/components/layout/LoginModal.tsx:17,246`

**Interfaces:**
- Consumes: `useAppleLoginMutation()` (новый, см. ниже); `VerifyOtpResponse`; `setCredentials`.
- Produces: `useAppleLoginMutation`; `<AppleSignInButton label onSuccess />`.

- [ ] **Step 1: Добавить i18n-ключ `continueWithApple` (RU/UZ/EN)**

В `apps/client/messages/en.json` после строки 85 (`"continueWithGoogle": "Continue with Google",`) добавить:
```json
    "continueWithApple": "Continue with Apple",
```
В `apps/client/messages/ru.json` после `"continueWithGoogle": "Войти через Google",` добавить:
```json
    "continueWithApple": "Войти через Apple",
```
В `apps/client/messages/uz.json` после `"continueWithGoogle": "Google orqali kirish",` добавить:
```json
    "continueWithApple": "Apple orqali kirish",
```

- [ ] **Step 2: Добавить мутацию `appleLogin` в `authApi.ts`**

После блока `googleLogin` (строки 138-160) вставить:
```typescript
    appleLogin: build.mutation<
      VerifyOtpResponse,
      { id_token: string; first_name?: string; last_name?: string }
    >({
      query: (body) => ({
        url: '/auth/apple',
        method: 'POST',
        body,
      }),
      // Успешный вход меняет «текущего пользователя».
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
          /* ошибку показывает UI через apiError-хелпер */
        }
      },
    }),
```
В экспорт хуков (строки 203-211) добавить `useAppleLoginMutation,` рядом с `useGoogleLoginMutation,`.

- [ ] **Step 3: Создать `apps/client/src/components/layout/AppleSignInButton.tsx`**

```tsx
/**
 * AppleSignInButton — кнопка Sign in with Apple (JS SDK, usePopup).
 * Инициализирует AppleID.auth, по клику открывает попап, шлёт id_token (+ имя
 * при первой авторизации) на /auth/apple через appleLogin. Рендерится только
 * если заданы NEXT_PUBLIC_APPLE_CLIENT_ID и NEXT_PUBLIC_APPLE_REDIRECT_URI.
 */
'use client';

import * as React from 'react';
import { useAppleLoginMutation } from '@/store/api/authApi';

interface AppleAuthResponse {
  authorization: { id_token: string; code: string; state?: string };
  user?: { name?: { firstName?: string; lastName?: string }; email?: string };
}
interface AppleIDAuth {
  init: (cfg: {
    clientId: string;
    scope: string;
    redirectURI: string;
    usePopup: boolean;
  }) => void;
  signIn: () => Promise<AppleAuthResponse>;
}
declare global {
  interface Window {
    AppleID?: { auth: AppleIDAuth };
  }
}

const APPLE_SRC =
  'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js';

export function AppleSignInButton({
  label,
  onSuccess,
}: {
  label: string;
  onSuccess?: () => void;
}) {
  const clientId = process.env.NEXT_PUBLIC_APPLE_CLIENT_ID;
  const redirectURI = process.env.NEXT_PUBLIC_APPLE_REDIRECT_URI;
  const [appleLogin] = useAppleLoginMutation();
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    if (!clientId || !redirectURI) return;

    const init = () => {
      if (!window.AppleID) return;
      window.AppleID.auth.init({
        clientId,
        scope: 'name email',
        redirectURI,
        usePopup: true,
      });
      setReady(true);
    };

    if (window.AppleID) {
      init();
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${APPLE_SRC}"]`,
    );
    if (existing) {
      existing.addEventListener('load', init);
      return () => existing.removeEventListener('load', init);
    }
    const script = document.createElement('script');
    script.src = APPLE_SRC;
    script.async = true;
    script.defer = true;
    script.onload = init;
    document.head.appendChild(script);
  }, [clientId, redirectURI]);

  const handleClick = async () => {
    if (!window.AppleID) return;
    try {
      const resp = await window.AppleID.auth.signIn();
      await appleLogin({
        id_token: resp.authorization.id_token,
        first_name: resp.user?.name?.firstName,
        last_name: resp.user?.name?.lastName,
      }).unwrap();
      onSuccess?.();
    } catch {
      /* отмена попапа или ошибка — показывает родитель/RTK */
    }
  };

  if (!clientId || !redirectURI) return null;
  return (
    <button
      type="button"
      onClick={() => void handleClick()}
      disabled={!ready}
      className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-md bg-black text-[15px] font-medium text-white disabled:opacity-60"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 384 512"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
      </svg>
      {label}
    </button>
  );
}
```

- [ ] **Step 4: Отрендерить кнопку в `LoginModal.tsx`**

Строка 17 — после импорта `GoogleSignInButton` добавить:
```typescript
import { AppleSignInButton } from './AppleSignInButton';
```
Строка 246 — после `<GoogleSignInButton onSuccess={() => onOpenChange(false)} />` добавить:
```tsx
              <AppleSignInButton
                label={t('continueWithApple')}
                onSuccess={() => onOpenChange(false)}
              />
```

- [ ] **Step 5: Lint + build клиента**

```bash
pnpm --filter @avino/client lint && pnpm --filter @avino/client exec next build
```
Expected: lint без ошибок; сборка успешна (если `rtk next build` покажет ложный «Errors: 1» — проверить сырой вывод `next build`, см. память про rtk false error).

- [ ] **Step 6: Commit**

```bash
git add apps/client/src/components/layout/AppleSignInButton.tsx apps/client/src/components/layout/LoginModal.tsx apps/client/src/store/api/authApi.ts apps/client/messages/ru.json apps/client/messages/uz.json apps/client/messages/en.json
git commit -m "feat(client): Sign in with Apple button in LoginModal"
```

---

## Task 3: Docs + OpenAPI regen + ADR + DONE

**Files:**
- Modify: `docs/API.md` (после раздела `POST /api/v1/auth/google`, строки ~128-144)
- Modify: `docs/ENV.md` (рядом с `GOOGLE_CLIENT_ID`, строка ~185)
- Modify: `apps/api/src/common/openapi/swagger.documents.ts:76`
- Regenerate: `apps/api/openapi.public.json`, `apps/api/openapi.internal.json`
- Create: `docs/adr/ADR-0097-sign-in-with-apple.md`
- Modify: `docs/DONE.md`

- [ ] **Step 1: Добавить раздел в `docs/API.md`**

Сразу после блока `POST /api/v1/auth/google` (перед `### POST /api/v1/auth/refresh`) вставить:
```markdown
### POST /api/v1/auth/apple

Вход через Apple (Sign in with Apple): верифицирует Apple ID-token офлайн
(audience = Service ID из `APPLE_CLIENT_ID`), создаёт/обновляет пользователя
(связывание по верифицированному email, login=signup), выдаёт токены. Тело
ответа идентично `otp/verify`. Auth: **public** (ADR-0097).

Body:
```json
{ "id_token": "eyJ... (Apple ID-token из Sign in with Apple JS)",
  "first_name": "Имя (опц., только при первой авторизации)",
  "last_name": "Фамилия (опц.)" }
```

200: тот же контракт, что `otp/verify` (`access_token`, `refresh_token`,
`token_type`, `expires_in`, `user`). Аккаунт создаётся с ролью `USER`,
`is_email_verified: true`.

Errors: `401 UNAUTHORIZED` (невалидный токен или `email_verified` ≠ true),
`403 USER_BLOCKED`, `503 AUTH_PROVIDER_UNAVAILABLE` (не задан `APPLE_CLIENT_ID`).
```

- [ ] **Step 2: Добавить env в `docs/ENV.md`**

Рядом со строкой `GOOGLE_CLIENT_ID` (≈185) добавить строки таблицы в том же формате колонок:
```markdown
| APPLE_CLIENT_ID | – | CSV Service ID(s) Apple — audience (`aud`) для верификации ID-token. Empty → /auth/apple returns 503 AUTH_PROVIDER_UNAVAILABLE |
| NEXT_PUBLIC_APPLE_CLIENT_ID | – | Service ID, отдаётся в браузер для Sign in with Apple JS. Пусто → кнопка Apple скрыта |
| NEXT_PUBLIC_APPLE_REDIRECT_URI | – | HTTPS-origin портала, зарегистрированный в Service ID (return URL) |
```

- [ ] **Step 3: Упомянуть Apple в описании OpenAPI**

В `apps/api/src/common/openapi/swagger.documents.ts` строка 76 — заменить:
```typescript
        'обновление — /auth/refresh; вход через Google — /auth/google. ' +
```
на:
```typescript
        'обновление — /auth/refresh; вход через Google — /auth/google; ' +
        'вход через Apple — /auth/apple. ' +
```

- [ ] **Step 4: Регенерировать OpenAPI-документы**

```bash
pnpm --filter @avino/api build
DATABASE_URL=postgresql://user:pass@localhost:5432/avino \
REDIS_URL=redis://localhost:6379 \
JWT_ACCESS_SECRET=ci-placeholder-secret \
JWT_REFRESH_SECRET=ci-placeholder-secret \
NODE_ENV=test \
pnpm --filter @avino/api exec node dist/scripts/export-openapi.js
```
Проверка, что путь добавился и drift-check пройдёт:
```bash
git --no-pager diff --stat -- apps/api/openapi.public.json apps/api/openapi.internal.json
grep -c "/api/v1/auth/apple" apps/api/openapi.public.json apps/api/openapi.internal.json
```
Expected: оба json изменены; `grep -c` ≥ 1 в каждом файле.

- [ ] **Step 5: Создать ADR `docs/adr/ADR-0097-sign-in-with-apple.md`**

```markdown
# ADR-0097: Sign in with Apple (web portal)

- Статус: Accepted
- Дата: 2026-06-19
- Связано: ADR-0065 (Google sign-in)

## Контекст
Владелец проекта попросил вход через Apple ID (iCloud), аналогично Google.

## Решение
1. `POST /api/v1/auth/apple { id_token, first_name?, last_name? }` — офлайн-
   верификация Apple ID-token (`apple-signin-auth`): подпись по JWKS Apple,
   `iss`, `aud ∈ APPLE_CLIENT_ID`, `exp`. Приватный ключ Apple НЕ нужен (нет
   серверного обмена code→токены, как и у Google).
2. Связывание по верифицированному email (login=signup), как ADR-0065 — без
   колонок provider/provider_id и без миграции БД. Trade-off: Gmail + Apple
   «Hide My Email» = два аккаунта.
3. Имя берётся из тела запроса (Apple отдаёт имя лишь при первой авторизации,
   не в токене) и сеет профиль; иначе профиль без имени.
4. `email_verified`/`is_private_email` приводятся из строки в boolean.
5. Сессия — общий TokenService; audit `provider: 'APPLE'`; Telegram-алерт.
6. `APPLE_CLIENT_ID` — CSV audience (Service ID веба; в будущем + bundle ID
   нативного приложения) → multi-audience без правок кода.
7. Config-gating: нет `APPLE_CLIENT_ID` → 503 AUTH_PROVIDER_UNAVAILABLE; нет
   `NEXT_PUBLIC_APPLE_CLIENT_ID`/`NEXT_PUBLIC_APPLE_REDIRECT_URI` → кнопка скрыта.
8. Только публичный портал (`apps/client`); админка на OTP.

## Последствия
- Реальная end-to-end проверка требует HTTPS-хоста и верифицированного Service
  ID/return URL — на localhost Apple не работает; локально — unit-тесты.
- Затронутые файлы: apps/api/src/auth/apple-auth.service.ts (+ spec),
  dto/apple-login.dto.ts, auth.controller.ts, auth.module.ts, config/*,
  telegram/auth-alert.util.ts; apps/client AppleSignInButton.tsx, authApi.ts,
  LoginModal.tsx, messages/*.
```

- [ ] **Step 6: Добавить запись в `docs/DONE.md`**

В начало списка (по образцу существующих записей о Google/фичах) добавить блок:
```markdown
- Вход через Apple (Sign in with Apple) на публичном портале: POST
  /api/v1/auth/apple верифицирует Apple ID-token офлайн, линкует по email
  (login=signup), выдаёт сессию; кнопка Apple в LoginModal. Config-gated
  (APPLE_CLIENT_ID / NEXT_PUBLIC_APPLE_*). ADR-0097.
  - apps/api/src/auth/apple-auth.service.ts (+ spec), dto/apple-login.dto.ts
  - auth.controller.ts (POST /auth/apple), auth.module.ts (AppleAuthService)
  - config (appleConfig, APPLE_CLIENT_ID), telegram/auth-alert.util.ts (provider APPLE)
  - apps/client AppleSignInButton.tsx, authApi.ts (appleLogin), LoginModal.tsx, messages/*
  - docs/API.md, docs/ENV.md, openapi.*.json
  - ПРОД-TODO: Apple Developer Program, Service ID + домен/return URL, env при деплое
```

- [ ] **Step 7: Commit**

```bash
git add docs/API.md docs/ENV.md docs/DONE.md docs/adr/ADR-0097-sign-in-with-apple.md apps/api/src/common/openapi/swagger.documents.ts apps/api/openapi.public.json apps/api/openapi.internal.json
git commit -m "docs(apple): API.md, ENV.md, ADR-0097, DONE.md + OpenAPI regen"
```

---

## Finalization (контроллер, не субагент)

После трёх задач — финализация в этой же ветке (память: финализация в feature-PR, не отдельным PR):

- [ ] Полный прогон: `pnpm --filter @avino/api exec jest` (зелёный), `pnpm --filter @avino/client exec next build` (зелёный).
- [ ] Push ветки `feat/apple-sign-in` и `gh pr create` (база `main`). **НЕ** мержить (`main` защищён) — мержит пользователь. Использовать токен из `~/.gh_token`, если `gh auth status` = not logged in.
- [ ] В описании PR — ссылка на спек и ADR-0097, список ПРОД-TODO (Apple Developer Program, Service ID, env).

---

## Self-Review

**Spec coverage:**
- `POST /auth/apple` офлайн-верификация → Task 1 (Steps 6-9). ✓
- Линковка по email, без миграции → Task 1 Step 8 (`resolveByEmail`). ✓
- Опц. имя из DTO → Task 1 Steps 4, 8 + тест Step 6. ✓
- `email_verified` строка→boolean → Task 1 Step 8 + тест. ✓
- 401/403/503 коды → Task 1 тесты. ✓
- Config-gating + multi-audience env → Task 1 Steps 2-3, 8. ✓
- TokenService/audit/Telegram(APPLE) → Task 1 Steps 5, 8. ✓
- Кнопка/мутация/LoginModal/i18n → Task 2. ✓
- Только портал, админка не тронута → нет задач для `apps/web`. ✓
- API.md/ENV.md/ADR-0097/DONE/OpenAPI → Task 3. ✓

**Placeholder scan:** код полный в каждом шаге; «ПРОД-TODO» — операционные предусловия (вне кода), не плейсхолдеры реализации. Контингенси по типу `audience` — однострочная заметка с действием, ловится на build-шаге.

**Type consistency:** `AppleAuthService.login(dto, ip?, userAgent?)` — единая сигнатура в сервисе, контроллере и тестах; `apple.clientIds: string[]` — одинаково в config и сервисе; `provider: 'GOOGLE' | 'APPLE'` — расширено до использования в сервисе; `useAppleLoginMutation` + `{ id_token, first_name?, last_name? }` — согласованы между authApi и AppleSignInButton.
