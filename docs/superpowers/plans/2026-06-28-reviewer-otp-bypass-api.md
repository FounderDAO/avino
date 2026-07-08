# Reviewer OTP bypass (App Store/Play) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Аккаунт-ревьювер `+998902793100` входит по OTP с ЛЮБЫМ 6-значным кодом и без отправки SMS, когда включён env-флаг (по умолчанию ВЫКЛ). Скоуп — только этот номер (CSV allowlist), канал SMS, обычная роль USER.

**Architecture:** Только `apps/api`, без миграций. Новый config-namespace `otp.bypassEnabled` / `otp.bypassPhones` (паттерн `OTP_TELEGRAM_DELIVERY`). Чистая функция `isReviewerBypass` решает, применять ли обход. `OtpService.requestOtp` коротит до отправки/генерации; `AuthService.verifyOtp` коротит до сверки кода и сразу завершает вход через выделенный `completeLogin`.

**Tech Stack:** NestJS, TypeScript, Prisma, @nestjs/config, class-validator, Jest.

## Global Constraints

- Только app-папка `apps/api` (граница задачи — одна app-папка).
- Никаких дефолтов для включения: `OTP_BYPASS_ENABLED` default `false`; пустой/невалидный `OTP_BYPASS_PHONES` ⇒ обход неактивен.
- Булевы env читаем строкой и парсим вручную (`=== 'true'`) — class-transformer привёл бы любую непустую строку к true (паттерн проекта).
- Номера в allowlist нормализуем как `normalizeContact`: убираем пробелы/дефисы/скобки, валидируем E.164 `^\+[1-9]\d{7,14}$`, невалидные отбрасываем.
- Обход применяется ТОЛЬКО для канала `SMS`. Рейт-лимиты (`@Throttle` на контроллере, `assertCanVerify` в сервисе) НЕ ослабляем сверх необходимого.
- НЕ меняем ни одного контроллера/DTO/роута ⇒ OpenAPI-доки без дрейфа, регенерация не требуется.
- НЕ трогать git до явного указания; финальные коммиты — Conventional Commits.

---

### Task 1: Config-флаги + bypass-утилита

**Files:**
- Modify: `apps/api/src/config/configuration.ts:180-189` (расширить `otpConfig`)
- Modify: `apps/api/src/config/env.validation.ts:224-228` (две опциональные env-переменные)
- Create: `apps/api/src/auth/otp-bypass.util.ts`
- Test: `apps/api/src/auth/otp-bypass.util.spec.ts`

**Interfaces:**
- Produces: `interface OtpBypassConfig { enabled: boolean; phones: string[] }` и `isReviewerBypass(cfg, channel, destination): boolean`. Config-ключи: `otp.bypassEnabled` (boolean), `otp.bypassPhones` (string[] нормализованных E.164).

- [ ] **Step 1: Расширить `otpConfig` в configuration.ts**

Заменить тело `otpConfig` (registerAs('otp', ...)):

```ts
export const otpConfig = registerAs('otp', () => ({
  ttl: parseInt(process.env.OTP_TTL ?? '300', 10),
  maxAttempts: parseInt(process.env.OTP_MAX_ATTEMPTS ?? '5', 10),
  resendCooldown: parseInt(process.env.OTP_RESEND_COOLDOWN ?? '60', 10),
  // Тест-стенд: доставлять OTP по телефону через Telegram (admin-чат), минуя
  // Eskiz, — как локально. Default OFF (прод не затрагивается); явный
  // OTP_TELEGRAM_DELIVERY=true включает на staging. В этом режиме SMS-канал
  // не шлёт SMS и не требует включённого SMS-тоггла (см. OtpService).
  telegramDelivery: process.env.OTP_TELEGRAM_DELIVERY === 'true',
  // Обход OTP для номеров-ревьюверов App Store/Play (config-gated, default OFF).
  // bypassEnabled включает приём ЛЮБОГО кода для bypassPhones; bypassPhones —
  // CSV в E.164 (нормализуем пробелы/дефисы/скобки, отбрасываем невалидные).
  bypassEnabled: process.env.OTP_BYPASS_ENABLED === 'true',
  bypassPhones: (process.env.OTP_BYPASS_PHONES ?? '')
    .split(',')
    .map((s) => s.replace(/[\s\-()]/g, ''))
    .filter((s) => /^\+[1-9]\d{7,14}$/.test(s)),
}));
```

- [ ] **Step 2: Добавить env-переменные в env.validation.ts**

После блока `OTP_TELEGRAM_DELIVERY` (строки ~224-228) добавить:

```ts
  // Тест-стенд: доставка телефонного OTP через Telegram (admin-чат), минуя Eskiz.
  // Булева как строка (class-transformer привёл бы любую непустую к true).
  @IsString()
  @IsOptional()
  OTP_TELEGRAM_DELIVERY?: string;

  // Обход OTP для номеров-ревьюверов App Store/Play (config-gated, default OFF).
  // Булева как строка; список номеров — CSV в E.164 (нормализация/валидация в
  // configuration.ts).
  @IsString()
  @IsOptional()
  OTP_BYPASS_ENABLED?: string;

  @IsString()
  @IsOptional()
  OTP_BYPASS_PHONES?: string;
```

(Строки `@IsString()/@IsOptional()/OTP_TELEGRAM_DELIVERY?` уже существуют — добавляются только два новых блока ниже них.)

- [ ] **Step 3: Создать bypass-утилиту**

Создать `apps/api/src/auth/otp-bypass.util.ts`:

```ts
import { OtpChannel } from '@prisma/client';

/** Параметры обхода OTP для номеров-ревьюверов (из otp.* конфига). */
export interface OtpBypassConfig {
  /** Глобальный флаг (OTP_BYPASS_ENABLED). */
  enabled: boolean;
  /** Нормализованные E.164 номера-ревьюверы (OTP_BYPASS_PHONES). */
  phones: string[];
}

/**
 * Применять ли обход OTP к данному контакту: флаг включён, канал SMS и
 * (уже нормализованный) номер входит в allowlist. `destination` ДОЛЖЕН быть
 * результатом normalizeContact — сравнение строгое по строке.
 */
export function isReviewerBypass(
  cfg: OtpBypassConfig,
  channel: OtpChannel,
  destination: string,
): boolean {
  return (
    cfg.enabled && channel === OtpChannel.SMS && cfg.phones.includes(destination)
  );
}
```

- [ ] **Step 4: Написать падающий тест утилиты**

Создать `apps/api/src/auth/otp-bypass.util.spec.ts`:

```ts
import { OtpChannel } from '@prisma/client';
import { isReviewerBypass } from './otp-bypass.util';

describe('isReviewerBypass', () => {
  const phones = ['+998902793100'];

  it('true когда включено, канал SMS и номер в allowlist', () => {
    expect(
      isReviewerBypass({ enabled: true, phones }, OtpChannel.SMS, '+998902793100'),
    ).toBe(true);
  });

  it('false когда флаг выключен', () => {
    expect(
      isReviewerBypass({ enabled: false, phones }, OtpChannel.SMS, '+998902793100'),
    ).toBe(false);
  });

  it('false для номера вне allowlist', () => {
    expect(
      isReviewerBypass({ enabled: true, phones }, OtpChannel.SMS, '+998901234567'),
    ).toBe(false);
  });

  it('false для канала EMAIL даже при совпадении строки', () => {
    expect(
      isReviewerBypass({ enabled: true, phones }, OtpChannel.EMAIL, '+998902793100'),
    ).toBe(false);
  });

  it('false при пустом allowlist', () => {
    expect(
      isReviewerBypass({ enabled: true, phones: [] }, OtpChannel.SMS, '+998902793100'),
    ).toBe(false);
  });
});
```

- [ ] **Step 5: Запустить тест утилиты**

Run: `pnpm --filter @avino/api test -- otp-bypass.util.spec`
Expected: PASS (утилита уже реализована в Step 3 — тест зелёный сразу). Если красный — проверить экспорт/импорт `isReviewerBypass`.

- [ ] **Step 6: Lint + build (config/env компилируются)**

Run: `pnpm --filter @avino/api lint`
Expected: без ошибок.

Run: `pnpm --filter @avino/api build`
Expected: успешная сборка. Если падает кучей cryptic TS-ошибок про `prisma.*` после смены ветки — это устаревший Prisma-клиент, выполнить `pnpm --filter @avino/api exec prisma generate` и пересобрать (схему мы НЕ меняли).

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/config/configuration.ts apps/api/src/config/env.validation.ts apps/api/src/auth/otp-bypass.util.ts apps/api/src/auth/otp-bypass.util.spec.ts
git commit -m "feat(api): add reviewer OTP bypass config flags and predicate"
```

---

### Task 2: Короткое замыкание запроса OTP (OtpService.requestOtp)

**Files:**
- Modify: `apps/api/src/auth/otp.service.ts:14-18` (импорт) и `:74-79` (вставка обхода после null-check destination)
- Test: `apps/api/src/auth/otp.service.spec.ts` (2 теста)

**Interfaces:**
- Consumes: `isReviewerBypass`, `OtpBypassConfig` (Task 1); config-ключи `otp.bypassEnabled`, `otp.bypassPhones`, `otp.ttl`.
- Produces: для bypass-номера `requestOtp` возвращает обычный `RequestOtpResult` (`{ request_id, channel: SMS, expires_in: ttl, resend_after: 0 }`) без побочных эффектов.

- [ ] **Step 1: Импортировать утилиту в otp.service.ts**

После строки `import { RequestOtpDto } from './dto/request-otp.dto';` добавить:

```ts
import { isReviewerBypass, type OtpBypassConfig } from './otp-bypass.util';
```

- [ ] **Step 2: Написать падающие тесты bypass-запроса**

Добавить в конец `describe('OtpService', ...)` (перед закрывающей `});`) в `apps/api/src/auth/otp.service.spec.ts`:

```ts
  it('short-circuits the OTP request for a reviewer bypass phone (no SMS, no code stored)', async () => {
    config.get.mockImplementation((k: string) => {
      if (k === 'otp.ttl') return 300;
      if (k === 'otp.bypassEnabled') return true;
      if (k === 'otp.bypassPhones') return ['+998902793100'];
      return undefined;
    });
    // SMS-тоггл выключен — обход не должен от него зависеть.
    sms.isEnabled.mockResolvedValue(false);

    const res = await service.requestOtp(
      { channel: OtpChannel.SMS, destination: '+998902793100' } as never,
      '1.2.3.4',
    );

    expect(res.channel).toBe(OtpChannel.SMS);
    expect(res.expires_in).toBe(300);
    // Ничего не сгенерировали/не сохранили/не отправили; rate-limit не трогали.
    expect(sms.sendOtp).not.toHaveBeenCalled();
    expect(prisma.otpCode.create).not.toHaveBeenCalled();
    expect(telegram.sendAdminAlert).not.toHaveBeenCalled();
    expect(rateLimit.assertCanRequest).not.toHaveBeenCalled();
  });

  it('does NOT bypass the request when the flag is off (same number, normal SMS flow)', async () => {
    config.get.mockImplementation((k: string) => {
      if (k === 'otp.ttl') return 300;
      if (k === 'otp.bypassEnabled') return false;
      if (k === 'otp.bypassPhones') return ['+998902793100'];
      if (k === 'telegram.includeOtpCode') return true;
      return undefined;
    });
    prisma.user.findFirst.mockResolvedValue(null);

    await service.requestOtp(
      { channel: OtpChannel.SMS, destination: '+998902793100' } as never,
      '1.2.3.4',
    );
    // Обычный путь: код доставлен и сохранён.
    expect(sms.sendOtp).toHaveBeenCalledTimes(1);
    expect(prisma.otpCode.create).toHaveBeenCalledTimes(1);
  });
```

- [ ] **Step 3: Запустить тесты — убедиться, что bypass-тест падает**

Run: `pnpm --filter @avino/api test -- otp.service.spec`
Expected: FAIL — первый новый тест валится (сейчас requestOtp для этого номера дойдёт до `sms.sendOtp`/`otpCode.create`).

- [ ] **Step 4: Вставить короткое замыкание в requestOtp**

В `apps/api/src/auth/otp.service.ts`, сразу ПОСЛЕ блока проверки `if (!destination) { ... }` (закрывающая `}` на ~строке 74) и ПЕРЕД `const telegramDelivery = ...` (строка 79) вставить:

```ts
    // Обход OTP для номеров-ревьюверов App Store/Play (config-gated, default OFF).
    // Короткое замыкание ДО проверки «SMS включён» и rate-limit: код не
    // генерируем и ничего не шлём — verify примет любой 6-значный код
    // (см. AuthService). Так запрос успешен даже при выключенном Eskiz.
    const bypass: OtpBypassConfig = {
      enabled: this.configService.get<boolean>('otp.bypassEnabled') ?? false,
      phones: this.configService.get<string[]>('otp.bypassPhones') ?? [],
    };
    if (isReviewerBypass(bypass, dto.channel, destination)) {
      const ttl = this.configService.get<number>('otp.ttl') ?? 300;
      return {
        request_id: `otp_${randomBytes(4).toString('hex')}`,
        channel: dto.channel,
        expires_in: ttl,
        resend_after: 0,
      };
    }

```

- [ ] **Step 5: Запустить тесты — убедиться, что проходят**

Run: `pnpm --filter @avino/api test -- otp.service.spec`
Expected: PASS — все тесты OtpService зелёные (4 существующих + 2 новых).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/auth/otp.service.ts apps/api/src/auth/otp.service.spec.ts
git commit -m "feat(api): short-circuit OTP request for reviewer bypass phones"
```

---

### Task 3: Приём любого кода на verify (AuthService.verifyOtp)

**Files:**
- Modify: `apps/api/src/auth/auth.service.ts:23-24` (импорт), `:141` (bypass в начале try), `:207-250` (вынести success-хвост в `completeLogin`)
- Test: `apps/api/src/auth/auth.service.spec.ts:56` (ключ-зависимый мок config) + 2 теста

**Interfaces:**
- Consumes: `isReviewerBypass`, `OtpBypassConfig` (Task 1); config-ключи `otp.bypassEnabled`, `otp.bypassPhones`.
- Produces: приватный `completeLogin(channel, destination, ip, userAgent): Promise<VerifyOtpResult>` — общий хвост входа (resolve + сессия + аудит + success-алерт), вызывается из обычного пути и из bypass.

- [ ] **Step 1: Импортировать утилиту в auth.service.ts**

После строки `import { MeResponse } from './dto/me-response.dto';` добавить:

```ts
import { isReviewerBypass, type OtpBypassConfig } from './otp-bypass.util';
```

- [ ] **Step 2: Сделать мок `config.get` ключ-зависимым (иначе сломается)**

В `apps/api/src/auth/auth.service.spec.ts`, в `beforeEach` блока `describe('AuthService.verifyOtp', ...)`, заменить:

```ts
    config = { get: jest.fn().mockReturnValue(5) }; // otp.maxAttempts
```

на:

```ts
    config = {
      get: jest.fn().mockImplementation((k: string) => {
        if (k === 'otp.maxAttempts') return 5;
        if (k === 'otp.bypassEnabled') return false;
        if (k === 'otp.bypassPhones') return [];
        return undefined;
      }),
    };
```

(Критично: прежний `mockReturnValue(5)` вернул бы `5` и для `otp.bypassEnabled` — truthy — и для `otp.bypassPhones`, где `(5).includes(...)` упадёт. Ключ-зависимый мок держит обход выключенным и существующие тесты зелёными.)

- [ ] **Step 3: Написать падающие тесты bypass-verify**

Добавить в конец `describe('AuthService.verifyOtp', ...)` (перед закрывающей `});`):

```ts
  it('reviewer bypass: accepts any code and logs in without consulting an OTP row', async () => {
    config.get.mockImplementation((k: string) => {
      if (k === 'otp.maxAttempts') return 5;
      if (k === 'otp.bypassEnabled') return true;
      if (k === 'otp.bypassPhones') return [DEST];
      return undefined;
    });
    prisma.user.findFirst.mockResolvedValue(baseUser);
    prisma.user.update.mockResolvedValue(baseUser);

    const result = await service.verifyOtp(dto('000000'), '127.0.0.1', 'jest-agent');

    expect(result.access_token).toBe('access');
    expect(result.user).toMatchObject({ id: 'u1', roles: ['USER'] });
    // Код не искали и не сверяли — обход коротит до completeLogin.
    expect(prisma.otpCode.findFirst).not.toHaveBeenCalled();
    expect(tokenService.issueSession).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', roles: ['USER'] }),
    );
    expect(prisma.auditLog.create).toHaveBeenCalled();
  });

  it('reviewer bypass disabled: the same number still requires a valid code', async () => {
    // config из beforeEach: bypassEnabled=false.
    prisma.otpCode.findFirst.mockResolvedValue(null); // нет активного кода
    await expectCode(
      service.verifyOtp(dto('000000'), '127.0.0.1'),
      ApiErrorCode.OTP_INVALID,
    );
    expect(prisma.otpCode.findFirst).toHaveBeenCalled();
  });
```

- [ ] **Step 4: Запустить — убедиться, что bypass-тест падает**

Run: `pnpm --filter @avino/api test -- auth.service.spec`
Expected: FAIL — тест «accepts any code» валится (verify сейчас ищет OTP-строку и отвергает '000000').

- [ ] **Step 5: Вынести success-хвост в `completeLogin`**

В `apps/api/src/auth/auth.service.ts` заменить блок успешного входа (строки ~207-250: от комментария `// Успех: код одноразовый...` до закрывающей `};` объекта результата):

```ts
      // Успех: код одноразовый — гасим, чтобы повторный verify не прошёл.
      await this.prisma.otpCode.update({
        where: { id: otp.id },
        data: { consumedAt: new Date() },
      });

      return await this.completeLogin(dto.channel, destination, ip, userAgent);
```

Затем добавить приватный метод `completeLogin` (например, сразу после `verifyOtp`, перед `getMe`):

```ts
  /**
   * Завершение входа после успешной проверки кода ИЛИ обхода OTP (reviewer
   * bypass): resolve пользователя (signup-as-login), выпуск сессии, аудит LOGIN
   * и success-алерт. Возвращает контракт `verify` (API.md §3).
   */
  private async completeLogin(
    channel: OtpChannel,
    destination: string,
    ip: string,
    userAgent: string | undefined,
  ): Promise<VerifyOtpResult> {
    const user = await this.resolveUser(channel, destination);

    const tokens = await this.tokenService.issueSession({
      userId: user.id,
      roles: user.roles,
      ip,
      userAgent,
    });

    await this.writeLoginAudit(user.id, ip, userAgent, channel);

    // Admin-алерт об успешном входе (best-effort, fire-and-forget).
    void this.telegram.sendAdminAlert(
      formatLoginSuccess({
        destination,
        channel,
        ip,
        isNewUser: user.isNew,
        roles: user.roles,
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
```

- [ ] **Step 6: Вставить bypass-проверку в начало `try` блока verifyOtp**

В `verifyOtp`, сразу ПОСЛЕ `try {` (строка ~141) и ПЕРЕД `const maxAttempts = ...` вставить:

```ts
    try {
      // Обход OTP для номеров-ревьюверов (config-gated, default OFF): принимаем
      // любой 6-значный код (длину уже проверил DTO) и сразу завершаем вход.
      // Внутри try — чтобы USER_BLOCKED из resolveUser попал в failure-алерт.
      const bypass: OtpBypassConfig = {
        enabled: this.config.get<boolean>('otp.bypassEnabled') ?? false,
        phones: this.config.get<string[]>('otp.bypassPhones') ?? [],
      };
      if (isReviewerBypass(bypass, dto.channel, destination)) {
        return await this.completeLogin(dto.channel, destination, ip, userAgent);
      }

      const maxAttempts = this.config.get<number>('otp.maxAttempts') ?? 5;
```

(Существующая строка `const maxAttempts = ...` теперь идёт сразу после вставленного блока — не дублировать её: показанный фрагмент включает её как якорь.)

- [ ] **Step 7: Запустить тесты verify — убедиться, что зелено**

Run: `pnpm --filter @avino/api test -- auth.service.spec`
Expected: PASS — все тесты AuthService зелёные (существующие success/fail/namespace + 2 новых bypass).

- [ ] **Step 8: Полный прогон auth-тестов + lint + build**

Run: `pnpm --filter @avino/api test -- auth`
Expected: PASS — otp.service, auth.service, otp-bypass.util и прочие auth-спеки зелёные.

Run: `pnpm --filter @avino/api lint`
Expected: без ошибок (нет unused: `formatLoginSuccess` по-прежнему используется внутри `completeLogin`).

Run: `pnpm --filter @avino/api build`
Expected: успешная сборка.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/auth/auth.service.ts apps/api/src/auth/auth.service.spec.ts
git commit -m "feat(api): accept any code on verify for reviewer bypass phones"
```

---

## Self-Review

**Spec coverage:**
- env-флаг (default OFF) + CSV allowlist E.164 → Task 1 (`otp.bypassEnabled`/`otp.bypassPhones`, нормализация/валидация).
- request не шлёт SMS и не требует включённого Eskiz → Task 2 (короткое замыкание до SMS-проверки и rate-limit).
- verify принимает любой 6-значный код, дальше штатный resolveUser/USER/токены → Task 3 (`completeLogin` через `resolveUser`).
- Только канал SMS; флаг OFF/пустой список → нет изменений поведения → покрыто `isReviewerBypass` + тесты «disabled» в Task 2/3.
- Рейт-лимиты не ослаблены сверх необходимого → `@Throttle` (контроллер) не трогаем; `assertCanVerify` остаётся перед bypass-проверкой.
- Без миграций / без изменения DTO-роутов → OpenAPI без дрейфа.

**Placeholder scan:** плейсхолдеров нет; весь код приведён целиком, якоря для вставок указаны.

**Type consistency:** `OtpBypassConfig {enabled, phones}` и `isReviewerBypass(cfg, channel, destination)` объявлены в Task 1 и одинаково используются в Task 2/3. `completeLogin(channel, destination, ip, userAgent)` объявлен и вызывается с совпадающей сигнатурой в обоих местах. Config-ключи `otp.bypassEnabled`/`otp.bypassPhones` единообразны в configuration.ts, обоих сервисах и тест-моках.

## Прод-развёртывание (TODO вне кода, после мёржа)

В серверные `.env` (staging И prod) добавить и пересоздать api-контейнер (`up -d --force-recreate api`, НЕ restart):

```
OTP_BYPASS_ENABLED=true
OTP_BYPASS_PHONES=+998902793100
```

Безопасность: аккаунт `+998902793100` держать как обычный USER (не выдавать admin-роль в БД — иначе обход = вход под admin для любого, кто знает номер).

## Live-verify (опционально, после деплоя на staging)

`POST /api/v1/auth/otp/request` `{channel:"SMS",destination:"+998902793100"}` → 200 без SMS. Затем `POST /api/v1/auth/otp/verify` `{channel:"SMS",destination:"+998902793100",code:"000000"}` → 200 с `access_token`. Проверка тела — через `rtk proxy curl` (обычный `rtk curl` отдаёт только схему).
