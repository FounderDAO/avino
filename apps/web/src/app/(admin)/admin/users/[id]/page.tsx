"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useSelector } from "react-redux";

import {
  useAssignAdminUserRoleMutation,
  useGetAdminUserQuery,
  useListRolesQuery,
  useRemoveAdminUserRoleMutation,
  useUpdateAdminUserStatusMutation,
} from "@/store/api/adminUsersApi";
import type { AdminUserDetail, RoleCode } from "@/store/api/adminTypes";
import type { UserStatus } from "@/store/api/authApi";
import { selectCurrentUser } from "@/store/slices/authSlice";
import { getApiError, getApiErrorCode } from "@/store/api/apiError";
import { formatDateTime, shortId } from "@/lib/format";
import {
  USER_STATUSES,
  USER_STATUS_ACTION_LABELS,
  USER_STATUS_BADGE,
  USER_STATUS_INTENT,
  USER_STATUS_LABELS,
  USER_STATUS_REQUIRES_REASON,
  languageLabel,
  roleLabel,
  userActionErrorMessage,
} from "@/lib/users";

/**
 * ADMIN-11/12 — карточка пользователя (`/admin/users/[id]`, API.md §6).
 *
 * Read-only представление (профиль, статус, аудит) + управление (ADMIN-12):
 * смена статуса (`PATCH /admin/users/:id` с reason для блок/удаления) и
 * назначение/снятие ролей (`POST`/`DELETE .../roles`). Защита от самоблокировки:
 * нельзя заблокировать/удалить себя и снять у себя роль ADMIN (бэкенд это
 * допускает — гард чисто фронтовый, чтобы админ не закрыл себе доступ). После
 * мутации кэш `Admin` инвалидируется — карточка перечитывается. Ошибки мапятся
 * по стабильному `error.code` (`409 ROLE_ALREADY_GRANTED` и т.д.). Данные —
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

  const currentUser = useSelector(selectCurrentUser);
  const isSelf = currentUser?.id === id;

  const userQuery = useGetAdminUserQuery(id, { skip: !id });
  const rolesQuery = useListRolesQuery();
  const user = userQuery.data;

  const [updateStatus, statusMutation] = useUpdateAdminUserStatusMutation();
  const [assignRole, assignMutation] = useAssignAdminUserRoleMutation();
  const [removeRole, removeMutation] = useRemoveAdminUserRoleMutation();

  // Смена статуса (подтверждение + причина).
  const [pendingStatus, setPendingStatus] = useState<UserStatus | null>(null);
  const [reason, setReason] = useState("");
  const [statusError, setStatusError] = useState<string | null>(null);

  // Управление ролями.
  const [roleToAdd, setRoleToAdd] = useState<RoleCode | "">("");
  const [roleError, setRoleError] = useState<string | null>(null);
  const [removingRole, setRemovingRole] = useState<RoleCode | null>(null);

  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const notFound =
    userQuery.isError && getApiErrorCode(userQuery.error) === "NOT_FOUND";

  // ─── Статус ─────────────────────────────────────────────────────────────
  function openStatusDialog(status: UserStatus) {
    setPendingStatus(status);
    setReason("");
    setStatusError(null);
    setSuccessMessage(null);
  }

  function closeStatusDialog() {
    if (statusMutation.isLoading) return;
    setPendingStatus(null);
    setReason("");
    setStatusError(null);
  }

  async function confirmStatus() {
    if (!pendingStatus) return;
    const trimmed = reason.trim();
    if (USER_STATUS_REQUIRES_REASON[pendingStatus] && !trimmed) {
      setStatusError("Укажите причину.");
      return;
    }
    try {
      await updateStatus({
        id,
        body: { status: pendingStatus, reason: trimmed || null },
      }).unwrap();
      setSuccessMessage(`Статус изменён: ${USER_STATUS_LABELS[pendingStatus]}.`);
      setPendingStatus(null);
      setReason("");
      setStatusError(null);
    } catch (err) {
      setStatusError(
        userActionErrorMessage(
          err as Parameters<typeof userActionErrorMessage>[0],
        ),
      );
    }
  }

  // ─── Роли ───────────────────────────────────────────────────────────────
  const availableRoles: RoleCode[] = (rolesQuery.data ?? [])
    .map((r) => r.code)
    .filter((code) => !user?.roles.includes(code));

  async function handleAssignRole() {
    if (!roleToAdd) return;
    setRoleError(null);
    setSuccessMessage(null);
    try {
      await assignRole({ id, body: { role: roleToAdd } }).unwrap();
      setSuccessMessage(`Роль назначена: ${roleLabel(roleToAdd)}.`);
      setRoleToAdd("");
    } catch (err) {
      setRoleError(
        userActionErrorMessage(
          err as Parameters<typeof userActionErrorMessage>[0],
        ),
      );
    }
  }

  async function handleRemoveRole(role: RoleCode) {
    setRoleError(null);
    setSuccessMessage(null);
    setRemovingRole(role);
    try {
      await removeRole({ id, role }).unwrap();
      setSuccessMessage(`Роль снята: ${roleLabel(role)}.`);
    } catch (err) {
      setRoleError(
        userActionErrorMessage(
          err as Parameters<typeof userActionErrorMessage>[0],
        ),
      );
    } finally {
      setRemovingRole(null);
    }
  }

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

      {successMessage && (
        <div className="rounded-lg border border-success-200 bg-success-50 px-4 py-3 text-theme-sm text-success-700 dark:border-success-500/30 dark:bg-success-500/[0.12] dark:text-success-400">
          {successMessage}
        </div>
      )}

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

          {/* Управление: статус + роли + аудит */}
          <aside className="lg:col-span-1">
            <div className="sticky top-6 space-y-5 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
              {/* Статус */}
              <div>
                <h2 className="mb-2 text-theme-sm font-semibold text-gray-800 dark:text-white/90">
                  Статус
                </h2>
                <p className="mb-3 text-theme-xs text-gray-500 dark:text-gray-400">
                  Текущий: <StatusBadge status={user.status} />
                </p>
                <div className="flex flex-col gap-2.5">
                  {USER_STATUSES.filter((s) => s !== user.status).map(
                    (status) => {
                      // Защита от самоблокировки: себя нельзя
                      // заблокировать/удалить (потеря доступа).
                      const selfLock =
                        isSelf &&
                        (status === "BLOCKED" || status === "DELETED");
                      return (
                        <button
                          key={status}
                          type="button"
                          disabled={selfLock || statusMutation.isLoading}
                          onClick={() => openStatusDialog(status)}
                          className={`rounded-lg px-4 py-2.5 text-theme-sm font-medium transition disabled:cursor-not-allowed ${USER_STATUS_INTENT[status]}`}
                          title={
                            selfLock
                              ? "Нельзя применить это действие к себе"
                              : undefined
                          }
                        >
                          {USER_STATUS_ACTION_LABELS[status]}
                        </button>
                      );
                    },
                  )}
                </div>
              </div>

              {/* Роли */}
              <div className="border-t border-gray-100 pt-4 dark:border-gray-800">
                <h2 className="mb-2 text-theme-sm font-semibold text-gray-800 dark:text-white/90">
                  Роли
                </h2>
                {user.roles.length === 0 ? (
                  <p className="text-theme-xs text-gray-400">Ролей нет.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {user.roles.map((code) => {
                      const selfAdmin = isSelf && code === "ADMIN";
                      const pending =
                        removingRole === code && removeMutation.isLoading;
                      return (
                        <span
                          key={code}
                          className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-0.5 text-theme-xs font-medium text-brand-600 dark:bg-brand-500/[0.15] dark:text-brand-400"
                        >
                          {roleLabel(code)}
                          <button
                            type="button"
                            onClick={() => handleRemoveRole(code)}
                            disabled={
                              selfAdmin ||
                              pending ||
                              removeMutation.isLoading ||
                              assignMutation.isLoading
                            }
                            className="text-brand-400 transition hover:text-error-500 disabled:cursor-not-allowed disabled:opacity-40"
                            title={
                              selfAdmin
                                ? "Нельзя снять роль ADMIN у себя"
                                : "Снять роль"
                            }
                            aria-label={`Снять роль ${roleLabel(code)}`}
                          >
                            {pending ? "…" : "✕"}
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}

                {/* Назначение роли */}
                <div className="mt-3 flex gap-2">
                  <select
                    value={roleToAdd}
                    onChange={(e) =>
                      setRoleToAdd(e.target.value as RoleCode | "")
                    }
                    disabled={
                      availableRoles.length === 0 || assignMutation.isLoading
                    }
                    className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-transparent px-3 py-2 text-theme-sm text-gray-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 disabled:opacity-50 dark:border-gray-700 dark:text-white"
                  >
                    <option value="">
                      {availableRoles.length === 0
                        ? "Все роли назначены"
                        : "Выберите роль…"}
                    </option>
                    {availableRoles.map((code) => (
                      <option key={code} value={code}>
                        {roleLabel(code)}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleAssignRole}
                    disabled={!roleToAdd || assignMutation.isLoading}
                    className="rounded-lg bg-brand-500 px-4 py-2 text-theme-sm font-medium text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-brand-500/40"
                  >
                    {assignMutation.isLoading ? "…" : "Назначить"}
                  </button>
                </div>

                {rolesQuery.isError && (
                  <p className="mt-2 text-theme-xs text-error-600 dark:text-error-500">
                    Не удалось загрузить справочник ролей.
                  </p>
                )}
                {roleError && (
                  <p className="mt-2 text-theme-sm text-error-600 dark:text-error-500">
                    {roleError}
                  </p>
                )}
              </div>

              {/* Аудит */}
              <dl className="space-y-2 border-t border-gray-100 pt-4 text-theme-xs dark:border-gray-800">
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

      {/* Диалог подтверждения смены статуса */}
      {pendingStatus && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={closeStatusDialog}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-theme-lg dark:border-gray-800 dark:bg-gray-900"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-theme-lg font-semibold text-gray-900 dark:text-white">
              {USER_STATUS_ACTION_LABELS[pendingStatus]} пользователя?
            </h3>
            <p className="mt-1 text-theme-sm text-gray-500 dark:text-gray-400">
              Новый статус: <StatusBadge status={pendingStatus} />
            </p>

            <label className="mt-4 flex flex-col gap-1.5">
              <span className="text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                Причина
                {USER_STATUS_REQUIRES_REASON[pendingStatus]
                  ? " (обязательно)"
                  : " (необязательно)"}
              </span>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                maxLength={255}
                placeholder="Например: нарушение правил, спам"
                className="rounded-lg border border-gray-300 bg-transparent px-3 py-2 text-theme-sm text-gray-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-gray-700 dark:text-white"
              />
            </label>

            {statusError && (
              <p className="mt-2 text-theme-sm text-error-600 dark:text-error-500">
                {statusError}
              </p>
            )}

            <div className="mt-5 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={closeStatusDialog}
                disabled={statusMutation.isLoading}
                className="rounded-lg border border-gray-300 px-4 py-2 text-theme-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-40 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.03]"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={confirmStatus}
                disabled={statusMutation.isLoading}
                className={`rounded-lg px-4 py-2 text-theme-sm font-medium transition disabled:cursor-not-allowed ${USER_STATUS_INTENT[pendingStatus]}`}
              >
                {statusMutation.isLoading
                  ? "Применяем…"
                  : USER_STATUS_ACTION_LABELS[pendingStatus]}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
