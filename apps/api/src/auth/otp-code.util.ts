import { HttpException, HttpStatus } from '@nestjs/common';
import { OtpChannel, OtpPurpose } from '@prisma/client';
import { ApiErrorCode } from '../common/dto/error-response.dto';
import { PrismaService } from '../prisma';
import { verifyOtpCode } from './otp-hash.util';

/**
 * Переиспользуемые примитивы жизненного цикла OTP-кода (TASK-041/042 + смена
 * контакта). Вынесены в чистые функции, параметризованные по {@link OtpPurpose},
 * чтобы login (`purpose=LOGIN`) и подтверждение смены контакта
 * (`purpose=CONTACT_CHANGE`) делили ОДНУ логику выпуска/погашения/проверки кода
 * — без дублирования brute-force-защиты и без изменения конструкторов сервисов
 * (юнит-тесты передают моки позиционно). `prisma` передаётся аргументом, поэтому
 * функции не зависят от DI.
 */

/** Данные для persist нового кода (`otp_codes`). */
export interface CreateOtpCodeInput {
  userId: string | null;
  channel: OtpChannel;
  destination: string;
  purpose: OtpPurpose;
  codeHash: string;
  expiresAt: Date;
}

/**
 * Погасить прежние неиспользованные коды на этот контакт в рамках данного
 * назначения — валиден только самый свежий (упрощает и обезопашивает verify).
 * Разные `purpose` изолированы: login не гасит коды смены контакта и наоборот.
 */
export async function invalidateActiveOtpCodes(
  prisma: PrismaService,
  destination: string,
  purpose: OtpPurpose,
): Promise<void> {
  await prisma.otpCode.updateMany({
    where: { destination, purpose, consumedAt: null },
    data: { consumedAt: new Date() },
  });
}

/** Сохранить новый код (`otp_codes`) со сроком истечения. */
export async function createOtpCode(
  prisma: PrismaService,
  input: CreateOtpCodeInput,
): Promise<void> {
  await prisma.otpCode.create({
    data: {
      userId: input.userId,
      channel: input.channel,
      destination: input.destination,
      purpose: input.purpose,
      codeHash: input.codeHash,
      expiresAt: input.expiresAt,
    },
  });
}

/** Параметры проверки+погашения активного кода. */
export interface ConsumeOtpCodeInput {
  destination: string;
  code: string;
  purpose: OtpPurpose;
  maxAttempts: number;
  /**
   * Если задан — код должен принадлежать этому пользователю (`user_id`). Login
   * не задаёт (код мог быть выписан на pre-signup контакт без user_id); смена
   * контакта задаёт всегда — код выпущен на текущего аутентифицированного юзера.
   */
  expectUserId?: string;
  /**
   * Колбэк на неверный код (не исчерпание/истечение) — кумулятивный brute-force
   * счётчик (`recordFailedVerify`). Fire-and-forget, как в login.
   */
  onFailedAttempt?: (destination: string) => void;
}

/**
 * Выбрать последний активный код на контакт и проверить его: истечение, лимит
 * попыток, совпадение хеша. Успех гасит код (`consumed_at`) — одноразовость.
 * Любой сбой бросает доменную {@link HttpException} (OTP_INVALID/EXPIRED/
 * ATTEMPTS_EXCEEDED) — вызывающий транслирует её клиенту как есть.
 *
 * Поведение полностью повторяет исходный inline-flow login (TASK-042), поэтому
 * рефактор его юнит-тестов не требует.
 */
export async function consumeActiveOtpCode(
  prisma: PrismaService,
  input: ConsumeOtpCodeInput,
): Promise<void> {
  const otp = await prisma.otpCode.findFirst({
    where: {
      destination: input.destination,
      purpose: input.purpose,
      consumedAt: null,
      ...(input.expectUserId ? { userId: input.expectUserId } : {}),
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!otp) {
    throw otpError(
      ApiErrorCode.OTP_INVALID,
      HttpStatus.BAD_REQUEST,
      'Invalid verification code',
    );
  }

  if (otp.expiresAt.getTime() <= Date.now()) {
    await prisma.otpCode.update({
      where: { id: otp.id },
      data: { consumedAt: new Date() },
    });
    throw otpError(
      ApiErrorCode.OTP_EXPIRED,
      HttpStatus.BAD_REQUEST,
      'Verification code has expired',
    );
  }

  if (otp.attempts >= input.maxAttempts) {
    throw otpError(
      ApiErrorCode.OTP_ATTEMPTS_EXCEEDED,
      HttpStatus.TOO_MANY_REQUESTS,
      'Too many invalid attempts, request a new code',
    );
  }

  const matches = await verifyOtpCode(input.code, otp.codeHash);
  if (!matches) {
    const attempts = otp.attempts + 1;
    await prisma.otpCode.update({
      where: { id: otp.id },
      data: { attempts },
    });
    // Кумулятивный brute-force счётчик — бюджет не сбрасывается при ре-запросе.
    input.onFailedAttempt?.(input.destination);
    throw attempts >= input.maxAttempts
      ? otpError(
          ApiErrorCode.OTP_ATTEMPTS_EXCEEDED,
          HttpStatus.TOO_MANY_REQUESTS,
          'Too many invalid attempts, request a new code',
        )
      : otpError(
          ApiErrorCode.OTP_INVALID,
          HttpStatus.BAD_REQUEST,
          'Invalid verification code',
        );
  }

  // Успех: код одноразовый — гасим, чтобы повторный verify не прошёл.
  await prisma.otpCode.update({
    where: { id: otp.id },
    data: { consumedAt: new Date() },
  });
}

function otpError(
  code: ApiErrorCode,
  status: HttpStatus,
  message: string,
): HttpException {
  return new HttpException({ code, message }, status);
}
