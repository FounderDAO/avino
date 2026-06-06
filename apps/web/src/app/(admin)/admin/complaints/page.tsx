"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import {
  useListAdminComplaintsQuery,
  useUpdateComplaintStatusMutation,
} from "@/store/api/adminComplaintsApi";
import type { Complaint, ComplaintStatus } from "@/store/api/adminTypes";
import { getApiError } from "@/store/api/apiError";
import { DEFAULT_LIMIT } from "@/store/api/pagination";
import { DataTable } from "@/components/admin/DataTable";
import { Pagination } from "@/components/admin/Pagination";
import type { Column, SelectOption } from "@/lib/table";
import { formatDateTime, shortId } from "@/lib/format";
import {
  COMPLAINT_STATUSES,
  COMPLAINT_STATUS_BADGE,
  COMPLAINT_STATUS_LABELS,
  complaintErrorMessage,
} from "@/lib/complaints";

/**
 * ADMIN-10 — жалобы (`/admin/complaints`, API.md §16).
 *
 * Таблица жалоб с фильтрами (status=NEW по умолчанию — очередь необработанных,
 * listing_id) и page-based пагинацией. Обработка жалобы — диалог со сменой
 * статуса (`PATCH /admin/complaints/:id` `{ status }`); мутация инвалидирует тег
 * `Admin`, поэтому список перечитывается после действия. Ссылка на листинг ведёт
 * в карточку модерации (ADMIN-09). Данные — только RTK Query (CLAUDE.md §4),
 * RU-only (i18n — ADMIN-17).
 */

const SEARCH_DEBOUNCE_MS = 300;

const STATUS_FILTER_OPTIONS: SelectOption<ComplaintStatus | "">[] = [
  { value: "", label: "Все статусы" },
  ...COMPLAINT_STATUSES.map((s) => ({
    value: s,
    label: COMPLAINT_STATUS_LABELS[s],
  })),
];

const STATUS_SELECT_OPTIONS: SelectOption<ComplaintStatus>[] =
  COMPLAINT_STATUSES.map((s) => ({ value: s, label: COMPLAINT_STATUS_LABELS[s] }));

/** Дебаунс значения (для текстовых фильтров). */
function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

/** Бейдж статуса жалобы. */
function StatusBadge({ status }: { status: ComplaintStatus }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-theme-xs font-medium ${COMPLAINT_STATUS_BADGE[status]}`}
    >
      {COMPLAINT_STATUS_LABELS[status]}
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

export default function AdminComplaintsPage() {
  const [status, setStatus] = useState<ComplaintStatus | "">("NEW");
  const [listingIdInput, setListingIdInput] = useState("");
  const [page, setPage] = useState(1);

  const listingId = useDebouncedValue(listingIdInput.trim(), SEARCH_DEBOUNCE_MS);

  // Любая смена фильтров возвращает к первой странице.
  useEffect(() => {
    setPage(1);
  }, [status, listingId]);

  const { data, isLoading, isFetching, isError, error, refetch } =
    useListAdminComplaintsQuery({
      status: status || undefined,
      listing_id: listingId || undefined,
      page,
      limit: DEFAULT_LIMIT,
    });

  const [updateStatus, update] = useUpdateComplaintStatusMutation();

  // Диалог обработки жалобы.
  const [active, setActive] = useState<Complaint | null>(null);
  const [target, setTarget] = useState<ComplaintStatus>("NEW");
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  function closeDialog() {
    if (update.isLoading) return;
    setActive(null);
    setActionError(null);
  }

  async function confirmAction() {
    if (!active || target === active.status) return;
    try {
      const updated = await updateStatus({
        id: active.id,
        status: target,
      }).unwrap();
      setSuccessMessage(
        `Жалоба обновлена: ${COMPLAINT_STATUS_LABELS[updated.status]}.`,
      );
      setActive(null);
      setActionError(null);
    } catch (err) {
      setActionError(
        complaintErrorMessage(
          err as Parameters<typeof complaintErrorMessage>[0],
        ),
      );
    }
  }

  const columns = useMemo<Column<Complaint>[]>(
    () => [
      {
        key: "reason",
        header: "Жалоба",
        render: (row) => (
          <div className="flex max-w-xs flex-col gap-0.5">
            <span className="font-medium text-gray-800 dark:text-white/90">
              {row.reason}
            </span>
            {row.details && (
              <span className="line-clamp-2 text-theme-xs text-gray-400">
                {row.details}
              </span>
            )}
            <span className="text-theme-xs text-gray-400">
              {shortId(row.id)}
            </span>
          </div>
        ),
      },
      {
        key: "listing_id",
        header: "Листинг",
        render: (row) => (
          <Link
            href={`/admin/listings/${row.listing_id}`}
            className="font-medium text-gray-700 transition hover:text-brand-500 dark:text-gray-300"
          >
            {shortId(row.listing_id)}
          </Link>
        ),
      },
      {
        key: "user_id",
        header: "Автор",
        render: (row) => (
          <span className="text-theme-xs text-gray-500 dark:text-gray-400">
            {row.user_id ? shortId(row.user_id) : "Аноним"}
          </span>
        ),
      },
      {
        key: "status",
        header: "Статус",
        align: "center",
        render: (row) => <StatusBadge status={row.status} />,
      },
      {
        key: "created_at",
        header: "Создана",
        align: "right",
        render: (row) => (
          <span className="whitespace-nowrap text-theme-xs text-gray-500 dark:text-gray-400">
            {formatDateTime(row.created_at)}
          </span>
        ),
      },
      {
        key: "handled_at",
        header: "Обработана",
        align: "right",
        render: (row) => (
          <div className="flex flex-col items-end">
            <span className="whitespace-nowrap text-theme-xs text-gray-500 dark:text-gray-400">
              {formatDateTime(row.handled_at)}
            </span>
            {row.handled_by && (
              <span className="text-theme-xs text-gray-400">
                {shortId(row.handled_by)}
              </span>
            )}
          </div>
        ),
      },
      {
        key: "actions",
        header: "",
        align: "right",
        render: (row) => (
          <button
            type="button"
            onClick={() => {
              setActive(row);
              setTarget(row.status);
              setActionError(null);
              setSuccessMessage(null);
            }}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-theme-xs font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.03]"
          >
            Обработать
          </button>
        ),
      },
    ],
    [],
  );

  const errorMessage = isError
    ? (getApiError(error)?.message ?? "Не удалось загрузить жалобы.")
    : undefined;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-title-sm font-bold text-gray-900 dark:text-white">
            Жалобы
          </h1>
          <p className="mt-1 text-theme-sm text-gray-500 dark:text-gray-400">
            Жалобы на объявления. По умолчанию — новые, требующие обработки.
          </p>
        </div>
        {isFetching && (
          <span className="text-theme-xs text-gray-400">Обновление…</span>
        )}
      </div>

      {successMessage && (
        <div className="rounded-lg border border-success-200 bg-success-50 px-4 py-3 text-theme-sm text-success-700 dark:border-success-500/30 dark:bg-success-500/[0.12] dark:text-success-400">
          {successMessage}
        </div>
      )}

      {/* Фильтры */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FilterSelect
          label="Статус"
          value={status}
          options={STATUS_FILTER_OPTIONS}
          onChange={setStatus}
        />
        <label className="flex flex-col gap-1.5">
          <span className="text-theme-xs font-medium text-gray-500 dark:text-gray-400">
            ID листинга
          </span>
          <input
            type="search"
            value={listingIdInput}
            onChange={(e) => setListingIdInput(e.target.value)}
            placeholder="Фильтр по объявлению"
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
        emptyMessage="По заданным фильтрам жалоб нет."
      />

      <Pagination meta={data?.meta} page={page} onPageChange={setPage} />

      {/* Диалог обработки жалобы */}
      {active && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={closeDialog}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-theme-lg dark:border-gray-800 dark:bg-gray-900"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-theme-lg font-semibold text-gray-900 dark:text-white">
              Обработка жалобы
            </h3>

            <dl className="mt-4 space-y-2.5 text-theme-sm">
              <div className="flex flex-col gap-0.5">
                <dt className="text-theme-xs font-medium text-gray-400">
                  Причина
                </dt>
                <dd className="text-gray-800 dark:text-gray-200">
                  {active.reason}
                </dd>
              </div>
              {active.details && (
                <div className="flex flex-col gap-0.5">
                  <dt className="text-theme-xs font-medium text-gray-400">
                    Подробности
                  </dt>
                  <dd className="whitespace-pre-line text-gray-800 dark:text-gray-200">
                    {active.details}
                  </dd>
                </div>
              )}
              <div className="flex items-center justify-between gap-2">
                <dt className="text-theme-xs font-medium text-gray-400">
                  Листинг
                </dt>
                <dd>
                  <Link
                    href={`/admin/listings/${active.listing_id}`}
                    className="font-medium text-brand-500 transition hover:text-brand-600"
                  >
                    Открыть {shortId(active.listing_id)}
                  </Link>
                </dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-theme-xs font-medium text-gray-400">
                  Текущий статус
                </dt>
                <dd>
                  <StatusBadge status={active.status} />
                </dd>
              </div>
            </dl>

            <label className="mt-4 flex flex-col gap-1.5">
              <span className="text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                Новый статус
              </span>
              <select
                value={target}
                onChange={(e) => setTarget(e.target.value as ComplaintStatus)}
                className="h-11 rounded-lg border border-gray-300 bg-transparent px-3 text-theme-sm text-gray-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-gray-700 dark:text-white dark:[&>option]:bg-gray-900"
              >
                {STATUS_SELECT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>

            {actionError && (
              <p className="mt-2 text-theme-sm text-error-600 dark:text-error-500">
                {actionError}
              </p>
            )}

            <div className="mt-5 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={closeDialog}
                disabled={update.isLoading}
                className="rounded-lg border border-gray-300 px-4 py-2 text-theme-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-40 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.03]"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={confirmAction}
                disabled={update.isLoading || target === active.status}
                className="rounded-lg bg-brand-500 px-4 py-2 text-theme-sm font-medium text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-brand-500/40"
              >
                {update.isLoading ? "Сохраняем…" : "Сохранить"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
