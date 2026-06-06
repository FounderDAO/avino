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
import { useToast } from "@/components/admin/toast/ToastProvider";
import { optionsFromLabels, type Column, type SelectOption } from "@/lib/table";
import { formatDateTime, shortId } from "@/lib/format";
import {
  COMPLAINT_STATUSES,
  COMPLAINT_STATUS_BADGE,
  complaintErrorMessage,
} from "@/lib/complaints";
import { useT, useEnumLabels, type EnumLabels } from "@/lib/i18n";

/**
 * ADMIN-10 — жалобы (`/admin/complaints`, API.md §16).
 *
 * Таблица жалоб с фильтрами (status=NEW по умолчанию — очередь необработанных,
 * listing_id) и page-based пагинацией. Обработка жалобы — диалог со сменой
 * статуса (`PATCH /admin/complaints/:id` `{ status }`); мутация инвалидирует тег
 * `Admin`, поэтому список перечитывается после действия. Ссылка на листинг ведёт
 * в карточку модерации (ADMIN-09). Данные — только RTK Query (CLAUDE.md §4),
 * локализовано (ADMIN-17).
 */

const SEARCH_DEBOUNCE_MS = 300;

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
function StatusBadge({
  status,
  labels,
}: {
  status: ComplaintStatus;
  labels: EnumLabels["complaintStatus"];
}) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-theme-xs font-medium ${COMPLAINT_STATUS_BADGE[status]}`}
    >
      {labels[status]}
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
  const { t, locale } = useT();
  const enums = useEnumLabels();

  const statusFilterOptions: SelectOption<ComplaintStatus | "">[] = useMemo(
    () => [
      { value: "", label: t("complaints.allStatuses") },
      ...COMPLAINT_STATUSES.map((s) => ({
        value: s,
        label: enums.complaintStatus[s],
      })),
    ],
    [t, enums],
  );

  const statusSelectOptions: SelectOption<ComplaintStatus>[] = useMemo(
    () => optionsFromLabels(enums.complaintStatus),
    [enums],
  );

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
  const toast = useToast();

  // Диалог обработки жалобы.
  const [active, setActive] = useState<Complaint | null>(null);
  const [target, setTarget] = useState<ComplaintStatus>("NEW");

  function closeDialog() {
    if (update.isLoading) return;
    setActive(null);
  }

  async function confirmAction() {
    if (!active || target === active.status) return;
    try {
      const updated = await updateStatus({
        id: active.id,
        status: target,
      }).unwrap();
      toast.success(
        t("complaints.updated", {
          status: enums.complaintStatus[updated.status],
        }),
      );
      setActive(null);
    } catch (err) {
      toast.error(
        complaintErrorMessage(
          err as Parameters<typeof complaintErrorMessage>[0],
          locale,
        ),
      );
    }
  }

  const columns = useMemo<Column<Complaint>[]>(
    () => [
      {
        key: "reason",
        header: t("complaints.colComplaint"),
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
        header: t("complaints.colListing"),
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
        header: t("complaints.colAuthor"),
        render: (row) => (
          <span className="text-theme-xs text-gray-500 dark:text-gray-400">
            {row.user_id ? shortId(row.user_id) : t("complaints.anonymous")}
          </span>
        ),
      },
      {
        key: "status",
        header: t("complaints.colStatus"),
        align: "center",
        render: (row) => (
          <StatusBadge status={row.status} labels={enums.complaintStatus} />
        ),
      },
      {
        key: "created_at",
        header: t("complaints.colCreated"),
        align: "right",
        render: (row) => (
          <span className="whitespace-nowrap text-theme-xs text-gray-500 dark:text-gray-400">
            {formatDateTime(row.created_at, locale)}
          </span>
        ),
      },
      {
        key: "handled_at",
        header: t("complaints.colHandled"),
        align: "right",
        render: (row) => (
          <div className="flex flex-col items-end">
            <span className="whitespace-nowrap text-theme-xs text-gray-500 dark:text-gray-400">
              {formatDateTime(row.handled_at, locale)}
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
            }}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-theme-xs font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.03]"
          >
            {t("complaints.handle")}
          </button>
        ),
      },
    ],
    [t, locale, enums],
  );

  const errorMessage = isError
    ? (getApiError(error)?.message ?? t("complaints.loadError"))
    : undefined;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-title-sm font-bold text-gray-900 dark:text-white">
            {t("complaints.title")}
          </h1>
          <p className="mt-1 text-theme-sm text-gray-500 dark:text-gray-400">
            {t("complaints.subtitle")}
          </p>
        </div>
        {isFetching && (
          <span className="text-theme-xs text-gray-400">
            {t("common.updating")}
          </span>
        )}
      </div>

      {/* Фильтры */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FilterSelect
          label={t("complaints.statusLabel")}
          value={status}
          options={statusFilterOptions}
          onChange={setStatus}
        />
        <label className="flex flex-col gap-1.5">
          <span className="text-theme-xs font-medium text-gray-500 dark:text-gray-400">
            {t("complaints.listingIdLabel")}
          </span>
          <input
            type="search"
            value={listingIdInput}
            onChange={(e) => setListingIdInput(e.target.value)}
            placeholder={t("complaints.listingIdPlaceholder")}
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
        emptyMessage={t("complaints.empty")}
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
              {t("complaints.dialogTitle")}
            </h3>

            <dl className="mt-4 space-y-2.5 text-theme-sm">
              <div className="flex flex-col gap-0.5">
                <dt className="text-theme-xs font-medium text-gray-400">
                  {t("complaints.fieldReason")}
                </dt>
                <dd className="text-gray-800 dark:text-gray-200">
                  {active.reason}
                </dd>
              </div>
              {active.details && (
                <div className="flex flex-col gap-0.5">
                  <dt className="text-theme-xs font-medium text-gray-400">
                    {t("complaints.fieldDetails")}
                  </dt>
                  <dd className="whitespace-pre-line text-gray-800 dark:text-gray-200">
                    {active.details}
                  </dd>
                </div>
              )}
              <div className="flex items-center justify-between gap-2">
                <dt className="text-theme-xs font-medium text-gray-400">
                  {t("complaints.fieldListing")}
                </dt>
                <dd>
                  <Link
                    href={`/admin/listings/${active.listing_id}`}
                    className="font-medium text-brand-500 transition hover:text-brand-600"
                  >
                    {t("complaints.openListing", {
                      id: shortId(active.listing_id),
                    })}
                  </Link>
                </dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-theme-xs font-medium text-gray-400">
                  {t("complaints.fieldCurrentStatus")}
                </dt>
                <dd>
                  <StatusBadge
                    status={active.status}
                    labels={enums.complaintStatus}
                  />
                </dd>
              </div>
            </dl>

            <label className="mt-4 flex flex-col gap-1.5">
              <span className="text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                {t("complaints.newStatusLabel")}
              </span>
              <select
                value={target}
                onChange={(e) => setTarget(e.target.value as ComplaintStatus)}
                className="h-11 rounded-lg border border-gray-300 bg-transparent px-3 text-theme-sm text-gray-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-gray-700 dark:text-white dark:[&>option]:bg-gray-900"
              >
                {statusSelectOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="mt-5 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={closeDialog}
                disabled={update.isLoading}
                className="rounded-lg border border-gray-300 px-4 py-2 text-theme-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-40 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.03]"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                onClick={confirmAction}
                disabled={update.isLoading || target === active.status}
                className="rounded-lg bg-brand-500 px-4 py-2 text-theme-sm font-medium text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-brand-500/40"
              >
                {update.isLoading ? t("common.applying") : t("common.save")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
