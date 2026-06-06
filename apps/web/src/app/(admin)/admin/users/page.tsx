"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import {
  useListAdminUsersQuery,
  useListRolesQuery,
} from "@/store/api/adminUsersApi";
import type { AdminUserRow, RoleCode } from "@/store/api/adminTypes";
import type { UserStatus } from "@/store/api/authApi";
import { getApiError } from "@/store/api/apiError";
import { DEFAULT_LIMIT } from "@/store/api/pagination";
import { DataTable } from "@/components/admin/DataTable";
import { Pagination } from "@/components/admin/Pagination";
import type { Column, SelectOption } from "@/lib/table";
import { formatDateTime, shortId } from "@/lib/format";
import { USER_STATUSES, USER_STATUS_BADGE } from "@/lib/users";
import { useT, useEnumLabels } from "@/lib/i18n";

/**
 * ADMIN-11 — пользователи (`/admin/users`, API.md §6).
 *
 * Таблица админ-списка пользователей с фильтрами (status, role, поиск `q` по
 * контакту/имени) и page-based пагинацией. Опции фильтра по роли берутся из
 * справочника `GET /roles`. Поиск дебаунсится; любая смена фильтра сбрасывает
 * страницу на 1. Контакт ведёт в карточку (`/admin/users/[id]`). Данные — только
 * через RTK Query (CLAUDE.md §4). Локализовано (i18n — ADMIN-17).
 */

const SEARCH_DEBOUNCE_MS = 300;

/** Дебаунс значения (для поля поиска). */
function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

/** Бейдж статуса пользователя. */
function StatusBadge({ status, label }: { status: UserStatus; label: string }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-theme-xs font-medium ${USER_STATUS_BADGE[status]}`}
    >
      {label}
    </span>
  );
}

/** Стилизованный select-фильтр (TailAdmin). */
function FilterSelect<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-theme-xs font-medium text-gray-500 dark:text-gray-400">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="h-11 rounded-lg border border-gray-300 bg-transparent px-3 text-theme-sm text-gray-900 shadow-theme-xs outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-gray-700 dark:text-white dark:[&>option]:bg-gray-900"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export default function AdminUsersPage() {
  const { t, locale } = useT();
  const enums = useEnumLabels();

  const [status, setStatus] = useState<UserStatus | "">("");
  const [role, setRole] = useState<RoleCode | "">("");
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);

  const q = useDebouncedValue(searchInput.trim(), SEARCH_DEBOUNCE_MS);

  const statusOptions = useMemo<SelectOption<UserStatus | "">[]>(
    () => [
      { value: "", label: t("users.allStatuses") },
      ...USER_STATUSES.map((s) => ({ value: s, label: enums.userStatus[s] })),
    ],
    [t, enums],
  );

  // Справочник ролей — источник опций фильтра (API.md §6).
  const rolesQuery = useListRolesQuery();
  const roleOptions = useMemo<SelectOption<RoleCode | "">[]>(
    () => [
      { value: "", label: t("users.allRoles") },
      ...(rolesQuery.data ?? []).map((r) => ({
        value: r.code,
        label: enums.role[r.code],
      })),
    ],
    [rolesQuery.data, t, enums],
  );

  // Любая смена фильтров возвращает к первой странице.
  useEffect(() => {
    setPage(1);
  }, [status, role, q]);

  const { data, isLoading, isFetching, isError, error, refetch } =
    useListAdminUsersQuery({
      status: status || undefined,
      role: role || undefined,
      q: q || undefined,
      page,
      limit: DEFAULT_LIMIT,
    });

  const columns = useMemo<Column<AdminUserRow>[]>(
    () => [
      {
        key: "contact",
        header: t("users.colUser"),
        render: (row) => (
          <div className="flex flex-col">
            <Link
              href={`/admin/users/${row.id}`}
              className="font-medium text-gray-800 transition hover:text-brand-500 dark:text-white/90"
            >
              {row.phone || row.email || t("users.noContact")}
            </Link>
            <span className="text-theme-xs text-gray-400">
              {shortId(row.id)}
            </span>
          </div>
        ),
      },
      {
        key: "roles",
        header: t("users.colRoles"),
        render: (row) =>
          row.roles.length === 0 ? (
            <span className="text-theme-xs text-gray-400">—</span>
          ) : (
            <div className="flex flex-wrap gap-1">
              {row.roles.map((code) => (
                <span
                  key={code}
                  className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-theme-xs font-medium text-gray-600 dark:bg-gray-700/40 dark:text-gray-300"
                >
                  {enums.role[code]}
                </span>
              ))}
            </div>
          ),
      },
      {
        key: "status",
        header: t("users.colStatus"),
        align: "center",
        render: (row) => (
          <StatusBadge status={row.status} label={enums.userStatus[row.status]} />
        ),
      },
      {
        key: "language",
        header: t("users.colLanguage"),
        align: "center",
        render: (row) => (
          <span className="text-theme-xs text-gray-500 dark:text-gray-400">
            {row.default_language}
          </span>
        ),
      },
      {
        key: "last_login_at",
        header: t("users.colLastLogin"),
        align: "right",
        render: (row) => (
          <span className="whitespace-nowrap text-theme-xs text-gray-500 dark:text-gray-400">
            {formatDateTime(row.last_login_at, locale)}
          </span>
        ),
      },
      {
        key: "created_at",
        header: t("users.colCreated"),
        align: "right",
        render: (row) => (
          <span className="whitespace-nowrap text-theme-xs text-gray-500 dark:text-gray-400">
            {formatDateTime(row.created_at, locale)}
          </span>
        ),
      },
    ],
    [t, enums, locale],
  );

  const errorMessage = isError
    ? (getApiError(error)?.message ?? t("users.loadError"))
    : undefined;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-title-sm font-bold text-gray-900 dark:text-white">
            {t("users.title")}
          </h1>
          <p className="mt-1 text-theme-sm text-gray-500 dark:text-gray-400">
            {t("users.subtitle")}
          </p>
        </div>
        {isFetching && (
          <span className="text-theme-xs text-gray-400">
            {t("common.updating")}
          </span>
        )}
      </div>

      {/* Фильтры */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <FilterSelect
          label={t("users.statusLabel")}
          value={status}
          options={statusOptions}
          onChange={setStatus}
        />
        <FilterSelect
          label={t("users.roleLabel")}
          value={role}
          options={roleOptions}
          onChange={setRole}
        />
        <label className="flex flex-col gap-1.5">
          <span className="text-theme-xs font-medium text-gray-500 dark:text-gray-400">
            {t("users.searchLabel")}
          </span>
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={t("users.searchPlaceholder")}
            className="h-11 rounded-lg border border-gray-300 bg-transparent px-3 text-theme-sm text-gray-900 shadow-theme-xs outline-none transition placeholder:text-gray-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-gray-700 dark:text-white"
          />
        </label>
      </div>

      <DataTable
        columns={columns}
        rows={data?.data}
        getRowKey={(row) => row.id}
        isLoading={isLoading}
        isError={isError}
        errorMessage={errorMessage}
        onRetry={refetch}
        emptyMessage={t("users.empty")}
      />

      <Pagination meta={data?.meta} page={page} onPageChange={setPage} />
    </div>
  );
}
