'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useDispatch } from 'react-redux';
import type { AppDispatch } from '@/store/store';
import { setCredentials } from '@/store/slices/authSlice';
import {
  useRequestOtpMutation,
  useVerifyOtpMutation,
} from '@/store/api/authApi';
import { getApiError, getApiErrorCode } from '@/store/api/apiError';
import { IC } from '@/components/admin/icons';
import logoIcon from '@/assets/logo/avino-appicon.svg';

/**
 * Логин админа — passwordless OTP по EMAIL (API.md §3, коды ошибок §17).
 * Шаг 1: email → POST /auth/otp/request (channel EMAIL).
 * Шаг 2: код → POST /auth/otp/verify → setCredentials → /admin.
 * RU-only (внутренний инструмент). Стиль — дизайн-токены Avino.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OTP_LENGTH = 6;

/** Стабильные коды ошибок API.md §17 → RU-текст. */
const ERROR_MESSAGES: Record<string, string> = {
  VALIDATION_ERROR: 'Проверьте правильность введённых данных.',
  RATE_LIMITED: 'Слишком много попыток. Попробуйте позже.',
  OTP_INVALID: 'Неверный код. Проверьте и попробуйте снова.',
  OTP_EXPIRED: 'Срок действия кода истёк. Запросите новый.',
  OTP_ATTEMPTS_EXCEEDED: 'Превышено число попыток. Запросите новый код.',
  USER_BLOCKED: 'Аккаунт заблокирован. Обратитесь к администратору.',
};
const GENERIC_ERROR = 'Что-то пошло не так. Попробуйте ещё раз.';

function messageForCode(code: string | null, fallback?: string): string {
  if (code && ERROR_MESSAGES[code]) return ERROR_MESSAGES[code];
  return fallback ?? GENERIC_ERROR;
}

export default function AdminLoginPage() {
  const router = useRouter();
  const dispatch = useDispatch<AppDispatch>();

  const [requestOtp, requestState] = useRequestOtpMutation();
  const [verifyOtp, verifyState] = useVerifyOtpMutation();

  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const codeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (resendIn <= 0) return;
    const id = window.setInterval(
      () => setResendIn((p) => (p <= 1 ? 0 : p - 1)),
      1000,
    );
    return () => window.clearInterval(id);
  }, [resendIn]);

  useEffect(() => {
    if (step === 'code') codeInputRef.current?.focus();
  }, [step]);

  const emailValid = EMAIL_RE.test(email.trim());
  const codeValid = code.length === OTP_LENGTH;
  const destination = () => email.trim().toLowerCase();

  async function sendOtp(): Promise<boolean> {
    const res = await requestOtp({ channel: 'EMAIL', destination: destination() }).unwrap();
    setCode('');
    setResendIn(res.resend_after);
    return true;
  }

  async function handleRequest(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!emailValid) { setError('Введите корректный email.'); return; }
    try {
      await sendOtp();
      setStep('code');
    } catch (err) {
      setError(messageForCode(getApiErrorCode(err as never), getApiError(err as never)?.message));
    }
  }

  async function handleResend() {
    if (resendIn > 0 || requestState.isLoading) return;
    setError(null);
    try {
      await sendOtp();
      codeInputRef.current?.focus();
    } catch (err) {
      setError(messageForCode(getApiErrorCode(err as never), getApiError(err as never)?.message));
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!codeValid) { setError(`Код состоит из ${OTP_LENGTH} цифр.`); return; }
    try {
      const res = await verifyOtp({ channel: 'EMAIL', destination: destination(), code }).unwrap();
      // refresh_token приходит в httpOnly cookie avino_rt (Set-Cookie на verify,
      // ADR-0153) — в JS не храним; в стор кладём только access + user.
      dispatch(setCredentials({
        access_token: res.access_token,
        user: res.user,
      }));
      router.replace('/admin');
    } catch (err) {
      setError(messageForCode(getApiErrorCode(err as never), getApiError(err as never)?.message));
    }
  }

  return (
    <main
      style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', background: 'var(--bg)', padding: 24,
      }}
    >
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div className="row" style={{ justifyContent: 'center', gap: 10, marginBottom: 24 }}>
          <Image
            src={logoIcon}
            alt="Avino"
            width={40}
            height={40}
            priority
            style={{ width: 40, height: 40, borderRadius: 12, display: 'block' }}
          />
          <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--ink)' }}>Avino</span>
        </div>

        <div className="a-card" style={{ padding: 28 }}>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)' }}>Вход в админку</h1>
          <p className="muted" style={{ marginTop: 6, fontSize: 14 }}>
            {step === 'email'
              ? 'Введите рабочий email — отправим код для входа.'
              : <>Код отправлен на <b>{destination()}</b>.</>}
          </p>

          {error && (
            <div
              role="alert"
              style={{
                marginTop: 18, borderRadius: 10, padding: '10px 14px',
                background: 'var(--red-bg)', color: 'var(--red)', fontSize: 13.5,
                border: '1px solid color-mix(in srgb, var(--red) 25%, transparent)',
              }}
            >
              {error}
            </div>
          )}

          {step === 'email' ? (
            <form onSubmit={handleRequest} style={{ marginTop: 20 }} noValidate>
              <label htmlFor="email" style={{ display: 'block', fontSize: 13.5, fontWeight: 600, marginBottom: 6, color: 'var(--ink)' }}>
                Email
              </label>
              <div style={{ position: 'relative' }}>
                <IC.Mail size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
                <input
                  id="email" type="email" inputMode="email" autoComplete="email"
                  autoFocus required value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@avino.uz"
                  className="a-field" style={{ paddingLeft: 36, width: '100%' }}
                />
              </div>
              <button
                type="submit" disabled={requestState.isLoading || !emailValid}
                className="abtn abtn-primary"
                style={{ marginTop: 18, width: '100%', opacity: requestState.isLoading || !emailValid ? 0.55 : 1 }}
              >
                {requestState.isLoading ? 'Отправляем…' : 'Получить код'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerify} style={{ marginTop: 20 }} noValidate>
              <label htmlFor="code" style={{ display: 'block', fontSize: 13.5, fontWeight: 600, marginBottom: 6, color: 'var(--ink)' }}>
                Код из письма
              </label>
              <input
                id="code" ref={codeInputRef} type="text" inputMode="numeric"
                autoComplete="one-time-code" pattern="\d*" maxLength={OTP_LENGTH}
                required value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, OTP_LENGTH))}
                placeholder="000000"
                className="a-field"
                style={{ width: '100%', textAlign: 'center', fontSize: 20, fontWeight: 700, letterSpacing: '0.4em' }}
              />
              <button
                type="submit" disabled={verifyState.isLoading || !codeValid}
                className="abtn abtn-primary"
                style={{ marginTop: 18, width: '100%', opacity: verifyState.isLoading || !codeValid ? 0.55 : 1 }}
              >
                {verifyState.isLoading ? 'Проверяем…' : 'Войти'}
              </button>
              <div className="row" style={{ justifyContent: 'space-between', marginTop: 14, fontSize: 13.5 }}>
                <button
                  type="button" className="abtn abtn-ghost abtn-sm"
                  onClick={() => { setStep('email'); setCode(''); setError(null); }}
                >
                  Изменить email
                </button>
                <button
                  type="button" className="abtn abtn-ghost abtn-sm"
                  onClick={handleResend}
                  disabled={resendIn > 0 || requestState.isLoading}
                  style={{ color: resendIn > 0 ? 'var(--muted)' : 'var(--teal)' }}
                >
                  {resendIn > 0 ? `Повторить через ${resendIn}с` : 'Отправить ещё раз'}
                </button>
              </div>
            </form>
          )}
        </div>

        <p className="muted" style={{ marginTop: 22, textAlign: 'center', fontSize: 12 }}>
          Только для администраторов Avino
        </p>
      </div>
    </main>
  );
}
