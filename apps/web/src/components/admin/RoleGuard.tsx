'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSelector } from 'react-redux';
import {
  selectAuthInitialized,
  selectIsAuthenticated,
} from '@/store/slices/authSlice';
import { useGetMeQuery } from '@/store/api/authApi';
import { useLogout } from '@/hooks/useLogout';

/**
 * RoleGuard — доступ к разделам админки (порт логики ADMIN-06, новый стиль).
 *  1. До гидрации/инициализации — нейтральный экран загрузки (нет hydration mismatch).
 *  2. Нет токенов → редирект /admin/login.
 *  3. Есть токен → GET /auth/me (истёкший access восстановит авто-refresh).
 *  4. Нет роли ADMIN → 403. Не-401 ошибка → «Повторить/Выйти».
 * Монтируется только на не-логин маршрутах (см. ConditionalShell).
 */

const LOGIN_ROUTE = '/admin/login';

export function RoleGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const initialized = useSelector(selectAuthInitialized);
  const isAuthenticated = useSelector(selectIsAuthenticated);

  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const ready = hydrated && initialized;

  const { data: me, isLoading, isError, refetch } = useGetMeQuery(undefined, {
    skip: !ready || !isAuthenticated,
  });

  useEffect(() => {
    if (ready && !isAuthenticated) router.replace(LOGIN_ROUTE);
  }, [ready, isAuthenticated, router]);

  if (!ready) return <StatusScreen>Загрузка…</StatusScreen>;
  if (!isAuthenticated) return <StatusScreen>Перенаправление…</StatusScreen>;
  if (isLoading) return <StatusScreen>Проверка доступа…</StatusScreen>;

  if (me) {
    if (me.roles.includes('ADMIN')) return <>{children}</>;
    return <ForbiddenScreen email={me.email} />;
  }
  if (isError) return <ErrorScreen onRetry={() => refetch()} />;
  return <StatusScreen>Проверка доступа…</StatusScreen>;
}

// ─── Экраны состояний (дизайн-токены Avino) ─────────────────────────────────

function CenteredShell({ children }: { children: React.ReactNode }) {
  return (
    <main
      style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', background: 'var(--bg)', padding: 24,
      }}
    >
      <div style={{ width: '100%', maxWidth: 420, textAlign: 'center' }}>
        <div className="row" style={{ justifyContent: 'center', gap: 10, marginBottom: 24 }}>
          <span
            style={{
              width: 40, height: 40, borderRadius: 12, background: 'var(--red)',
              color: '#fff', fontWeight: 800, fontSize: 18, display: 'flex',
              alignItems: 'center', justifyContent: 'center',
            }}
          >A</span>
          <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--ink)' }}>Avino</span>
        </div>
        <div className="a-card" style={{ padding: 28 }}>{children}</div>
      </div>
    </main>
  );
}

function StatusScreen({ children }: { children: React.ReactNode }) {
  return (
    <main
      style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', background: 'var(--bg)',
      }}
    >
      <div className="col" style={{ alignItems: 'center', gap: 14 }}>
        <span
          aria-hidden
          style={{
            width: 30, height: 30, borderRadius: '50%',
            border: '3px solid var(--border)', borderTopColor: 'var(--red)',
            animation: 'spin 0.7s linear infinite',
          }}
        />
        <p className="muted" style={{ fontSize: 14 }}>{children}</p>
      </div>
    </main>
  );
}

function ForbiddenScreen({ email }: { email: string | null }) {
  const logout = useLogout();
  return (
    <CenteredShell>
      <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)' }}>Доступ запрещён</h1>
      <p className="muted" style={{ marginTop: 8, fontSize: 14 }}>
        {email ? <>Аккаунт <b>{email}</b> не имеет прав администратора.</> : 'У аккаунта нет прав администратора.'}{' '}
        Войдите под другим аккаунтом.
      </p>
      <button className="abtn abtn-primary" style={{ marginTop: 22, width: '100%' }} onClick={logout}>
        Войти под другим аккаунтом
      </button>
    </CenteredShell>
  );
}

function ErrorScreen({ onRetry }: { onRetry: () => void }) {
  const logout = useLogout();
  return (
    <CenteredShell>
      <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)' }}>Не удалось проверить доступ</h1>
      <p className="muted" style={{ marginTop: 8, fontSize: 14 }}>
        Проблема с сетью или сервером. Попробуйте ещё раз.
      </p>
      <button className="abtn abtn-primary" style={{ marginTop: 22, width: '100%' }} onClick={onRetry}>
        Повторить
      </button>
      <button className="abtn abtn-outline" style={{ marginTop: 10, width: '100%' }} onClick={logout}>
        Выйти
      </button>
    </CenteredShell>
  );
}
