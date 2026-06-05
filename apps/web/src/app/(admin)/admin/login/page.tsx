"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useDispatch } from "react-redux";

import type { AppDispatch } from "@/store/store";
import { setCredentials } from "@/store/slices/authSlice";
import {
  useRequestOtpMutation,
  useVerifyOtpMutation,
} from "@/store/api/authApi";
import { getApiError, getApiErrorCode } from "@/store/api/apiError";
import { ThemeToggleButton } from "@/components/common/ThemeToggleButton";

/**
 * ADMIN-05 — страница логина админа (passwordless OTP по EMAIL).
 *
 * Шаг 1: email → POST /auth/otp/request  (channel: EMAIL).
 * Шаг 2: код  → POST /auth/otp/verify    → сохранить токены → /admin.
 *
 * Таймер resend берётся из `resend_after`; ошибки мапятся по стабильным кодам
 * API (docs/API.md §17). RU-only — внутренний инструмент (ADMIN-17 — i18n).
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OTP_LENGTH = 6;

/** Человекочитаемый текст по стабильному коду ошибки API (§17). */
function messageForCode(code: string | null, fallback?: string): string {
  switch (code) {
    case "VALIDATION_ERROR":
      return "Проверьте правильность введённых данных.";
    case "RATE_LIMITED":
      return "Слишком много запросов. Подождите немного и попробуйте снова.";
    case "OTP_INVALID":
      return "Неверный код. Проверьте и попробуйте ещё раз.";
    case "OTP_EXPIRED":
      return "Код подтверждения истёк. Запросите новый.";
    case "OTP_ATTEMPTS_EXCEEDED":
      return "Превышено число попыток ввода. Запросите новый код.";
    case "USER_BLOCKED":
      return "Аккаунт заблокирован. Обратитесь к администратору.";
    default:
      return fallback ?? "Не удалось выполнить запрос. Попробуйте ещё раз.";
  }
}

export default function AdminLoginPage() {
  const router = useRouter();
  const dispatch = useDispatch<AppDispatch>();

  const [requestOtp, requestState] = useRequestOtpMutation();
  const [verifyOtp, verifyState] = useVerifyOtpMutation();

  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);

  const codeInputRef = useRef<HTMLInputElement>(null);

  // Обратный отсчёт до повторной отправки кода (resend_after из ответа).
  useEffect(() => {
    if (resendIn <= 0) return;
    const id = window.setInterval(() => {
      setResendIn((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [resendIn]);

  // Автофокус на поле кода при переходе на шаг 2.
  useEffect(() => {
    if (step === "code") codeInputRef.current?.focus();
  }, [step]);

  const emailValid = EMAIL_RE.test(email.trim());
  const codeValid = code.length === OTP_LENGTH;

  async function handleRequest(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!emailValid) {
      setError("Введите корректный email.");
      return;
    }
    try {
      const res = await requestOtp({
        channel: "EMAIL",
        destination: email.trim().toLowerCase(),
      }).unwrap();
      setCode("");
      setResendIn(res.resend_after);
      setStep("code");
    } catch (err) {
      setError(
        messageForCode(getApiErrorCode(err as never), getApiError(err as never)?.message),
      );
    }
  }

  async function handleResend() {
    if (resendIn > 0 || requestState.isLoading) return;
    setError(null);
    try {
      const res = await requestOtp({
        channel: "EMAIL",
        destination: email.trim().toLowerCase(),
      }).unwrap();
      setCode("");
      setResendIn(res.resend_after);
      codeInputRef.current?.focus();
    } catch (err) {
      setError(messageForCode(getApiErrorCode(err as never), getApiError(err as never)?.message));
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!codeValid) {
      setError(`Код состоит из ${OTP_LENGTH} цифр.`);
      return;
    }
    try {
      const res = await verifyOtp({
        channel: "EMAIL",
        destination: email.trim().toLowerCase(),
        code,
      }).unwrap();
      dispatch(
        setCredentials({
          access_token: res.access_token,
          refresh_token: res.refresh_token,
          user: res.user,
        }),
      );
      router.replace("/admin");
    } catch (err) {
      setError(messageForCode(getApiErrorCode(err as never), getApiError(err as never)?.message));
    }
  }

  function backToEmail() {
    setStep("email");
    setCode("");
    setError(null);
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12 dark:bg-gray-900">
      <div className="absolute right-4 top-4">
        <ThemeToggleButton />
      </div>

      <div className="w-full max-w-md">
        {/* Бренд Avino */}
        <div className="mb-8 flex items-center justify-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500 text-lg font-bold text-white">
            A
          </span>
          <span className="text-2xl font-bold text-gray-900 dark:text-white">
            Avino
          </span>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-theme-sm dark:border-gray-800 dark:bg-white/[0.03] sm:p-8">
          <h1 className="text-title-sm font-bold text-gray-900 dark:text-white">
            Вход в админку
          </h1>
          <p className="mt-1 text-theme-sm text-gray-500 dark:text-gray-400">
            {step === "email"
              ? "Введите email — отправим код подтверждения."
              : `Код отправлен на ${email.trim().toLowerCase()}.`}
          </p>

          {error && (
            <div
              role="alert"
              className="mt-5 rounded-lg border border-error/30 bg-error/5 px-4 py-3 text-theme-sm text-error"
            >
              {error}
            </div>
          )}

          {step === "email" ? (
            <form onSubmit={handleRequest} className="mt-6 space-y-5" noValidate>
              <div>
                <label
                  htmlFor="email"
                  className="mb-1.5 block text-theme-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  autoFocus
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@avino.uz"
                  className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-theme-sm text-gray-900 shadow-theme-xs outline-none transition placeholder:text-gray-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-gray-700 dark:text-white"
                />
              </div>

              <button
                type="submit"
                disabled={requestState.isLoading || !emailValid}
                className="flex h-11 w-full cursor-pointer items-center justify-center rounded-lg bg-brand-500 text-theme-sm font-medium text-white shadow-theme-xs transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {requestState.isLoading ? "Отправляем…" : "Получить код"}
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerify} className="mt-6 space-y-5" noValidate>
              <div>
                <label
                  htmlFor="code"
                  className="mb-1.5 block text-theme-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  Код из письма
                </label>
                <input
                  id="code"
                  ref={codeInputRef}
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="\d*"
                  maxLength={OTP_LENGTH}
                  required
                  value={code}
                  onChange={(e) =>
                    setCode(
                      e.target.value.replace(/\D/g, "").slice(0, OTP_LENGTH),
                    )
                  }
                  placeholder="000000"
                  className="h-12 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-center text-lg font-semibold tracking-[0.5em] text-gray-900 shadow-theme-xs outline-none transition placeholder:tracking-[0.5em] placeholder:text-gray-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-gray-700 dark:text-white"
                />
              </div>

              <button
                type="submit"
                disabled={verifyState.isLoading || !codeValid}
                className="flex h-11 w-full cursor-pointer items-center justify-center rounded-lg bg-brand-500 text-theme-sm font-medium text-white shadow-theme-xs transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {verifyState.isLoading ? "Проверяем…" : "Войти"}
              </button>

              <div className="flex items-center justify-between text-theme-sm">
                <button
                  type="button"
                  onClick={backToEmail}
                  className="cursor-pointer font-medium text-gray-500 transition hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  ← Изменить email
                </button>
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resendIn > 0 || requestState.isLoading}
                  className="cursor-pointer font-medium text-brand-500 transition hover:text-brand-600 disabled:cursor-not-allowed disabled:text-gray-400 dark:disabled:text-gray-500"
                >
                  {resendIn > 0
                    ? `Отправить повторно (${resendIn})`
                    : "Отправить повторно"}
                </button>
              </div>
            </form>
          )}
        </div>

        <p className="mt-6 text-center text-theme-xs text-gray-400 dark:text-gray-500">
          Доступ только для администраторов Avino.
        </p>
      </div>
    </main>
  );
}
