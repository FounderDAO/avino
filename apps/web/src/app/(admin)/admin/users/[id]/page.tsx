"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { useGetAdminUserQuery } from "@/store/api/adminUsersApi";
import type { AdminUserDetail } from "@/store/api/adminTypes";
import type { UserStatus } from "@/store/api/authApi";
import { getApiError, getApiErrorCode } from "@/store/api/apiError";
import { formatDateTime, shortId } from "@/lib/format";
import {
  USER_STATUS_BADGE,
  USER_STATUS_LABELS,
  languageLabel,
  roleLabel,
} from "@/lib/users";

/**
 * ADMIN-11 — карточка пользователя (`/admin/users/[id]`, API.md §6).
 *
 * Read-only представление: профиль, роли, статус и аудит-таймстемпы
 * (`GET /admin/users/:id`). Смена статуса и управление ролями — ADMIN-12.
 * `DELETED`/несуществующий → `404` обрабатывается как «недоступен». Данные —
 * только через RTK Query (CLAUDE.md §4). RU-only (i18n — ADMIN-17).
 */

/** Бейдж статуса пользователя. */
function StatusBadge({ status }: { status: UserStatus }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-theme-xs font-medium ${USER_STATUS_BADGE[status]}`}
    >
      {USER_STATUS_LABELS[status]}
    </span>
  );
}

/** Строка «подпись → значение» в карточке. */
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-gray-100 py-2.5 last:border-0 dark:border-gray-800">
      <span className="text-theme-xs font-medium text-gray-400">{label}</span>
      <span className="text-theme-sm text-gray-800 dark:text-gray-200">
        {children}
      </span>
    </div>
  );
}

/** Контакт с отметкой верификации. */
function Verified({
  value,
  verified,
}: {
  value: string | null;
  verified: boolean;
}) {
  if (!value) return <>—</>;
  return (
    <span className="flex items-center gap-2">
      {value}
      <span
        className={`inline-flex rounded-full px-2 py-0.5 text-theme-xs font-medium ${
          verified
            ? "bg-success-50 text-success-600 dark:bg-success-500/[0.15] dark:text-success-500"
            : "bg-gray-100 text-gray-500 dark:bg-gray-700/40 dark:text-gray-400"
        }`}
      >
        {verified ? "подтверждён" : "не подтверждён"}
      </span>
    </span>
  );
}

function fullName(user: AdminUserDetail): string {
  const profile = user.profile;
  if (!profile) return user.phone || user.email || "Пользователь";
  const composed = [profile.first_name, profile.last_name]
    .filter(Boolean)
    .join(" ");
  return (
    profile.display_name ||
    composed ||
    user.phone ||
    user.email ||
    "Пользователь"
  );
}

export default function AdminUserDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const userQuery = useGetAdminUserQuery(id, { skip: !id });
  const user = userQuery.data;

  const notFound =
    userQuery.isError && getApiErrorCode(userQuery.error) === "NOT_FOUND";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <Link
            href="/admin/users"
            className="text-theme-xs font-medium text-gray-500 transition hover:text-brand-500 dark:text-gray-400"
          >
            ← К списку пользователей
          </Link>
          <h1 className="text-title-sm font-bold text-gray-900 dark:text-white">
            {user ? fullName(user) : "Карточка пользователя"}
          </h1>
          <span className="text-theme-xs text-gray-400">{shortId(id)}</span>
        </div>
        {user && <StatusBadge status={user.status} />}
      </div>

      {userQuery.isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-5 w-full max-w-md animate-pulse rounded bg-gray-100 dark:bg-gray-800"
            />
          ))}
        </div>
      )}

      {notFound && (
        <div className="rounded-2xl border border-gray-200 bg-white px-5 py-12 text-center dark:border-gray-800 dark:bg-white/[0.03]">
          <p className="text-theme-sm text-gray-500 dark:text-gray-400">
            Пользователь недоступен — не найден или удалён.
          </p>
        </div>
      )}

      {userQuery.isError && !notFound && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-gray-200 bg-white px-5 py-12 text-center dark:border-gray-800 dark:bg-white/[0.03]">
          <p className="text-theme-sm text-error-600 dark:text-error-500">
            {getApiError(userQuery.error)?.message ??
              "Не удалось загрузить пользователя."}
          </p>
          <button
            type="button"
            onClick={() => userQuery.refetch()}
            className="rounded-lg border border-gray-300 px-4 py-2 text-theme-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.03]"
          >
            Повторить
          </button>
        </div>
      )}

      {user && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Аккаунт + профиль */}
          <div className="space-y-6 lg:col-span-2">
            <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
              <h2 className="mb-2 text-theme-sm font-semibold text-gray-800 dark:text-white/90">
                Аккаунт
              </h2>
              <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
                <Field label="Телефон">
                  <Verified
                    value={user.phone}
                    verified={user.is_phone_verified}
                  />
                </Field>
                <Field label="Email">
                  <Verified
                    value={user.email}
                    verified={user.is_email_verified}
                  />
                </Field>
                <Field label="Статус">
                  <StatusBadge status={user.status} />
                </Field>
                <Field label="Язык интерфейса">
                  {languageLabel(user.default_language)}
                </Field>
              </div>
            </section>

            <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
              <h2 className="mb-2 text-theme-sm font-semibold text-gray-800 dark:text-white/90">
                Профиль
              </h2>
              {user.profile ? (
                <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
                  <Field label="Имя">{user.profile.first_name || "—"}</Field>
                  <Field label="Фамилия">{user.profile.last_name || "—"}</Field>
                  <Field label="Отображаемое имя">
                    {user.profile.display_name || "—"}
                  </Field>
                  <Field label="Контактный телефон">
                    {user.profile.contact_phone || "—"}
                  </Field>
                  <Field label="Предпочитаемый язык">
                    {languageLabel(user.profile.preferred_language)}
                  </Field>
                </div>
              ) : (
                <p className="text-theme-sm text-gray-500 dark:text-gray-400">
                  Профиль не заполнен.
                </p>
              )}
            </section>
          </div>

          {/* Роли + аудит */}
          <aside className="lg:col-span-1">
            <div className="sticky top-6 space-y-4 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
              <div>
                <h2 className="mb-2 text-theme-sm font-semibold text-gray-800 dark:text-white/90">
                  Роли
                </h2>
                {user.roles.length === 0 ? (
                  <p className="text-theme-xs text-gray-400">Ролей нет.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {user.roles.map((code) => (
                      <span
                        key={code}
                        className="inline-flex rounded-full bg-brand-50 px-2.5 py-0.5 text-theme-xs font-medium text-brand-600 dark:bg-brand-500/[0.15] dark:text-brand-400"
                      >
                        {roleLabel(code)}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <dl className="space-y-2 border-t border-gray-100 pt-3 text-theme-xs dark:border-gray-800">
                <div className="flex justify-between gap-2">
                  <dt className="text-gray-400">Создан</dt>
                  <dd className="text-gray-600 dark:text-gray-300">
                    {formatDateTime(user.created_at)}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-gray-400">Обновлён</dt>
                  <dd className="text-gray-600 dark:text-gray-300">
                    {formatDateTime(user.updated_at)}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-gray-400">Последний вход</dt>
                  <dd className="text-gray-600 dark:text-gray-300">
                    {formatDateTime(user.last_login_at)}
                  </dd>
                </div>
                {user.deleted_at && (
                  <div className="flex justify-between gap-2">
                    <dt className="text-gray-400">Удалён</dt>
                    <dd className="text-error-600 dark:text-error-500">
                      {formatDateTime(user.deleted_at)}
                    </dd>
                  </div>
                )}
              </dl>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
