"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { useListPromotionLogsQuery } from "@/store/api/adminLogsApi";
import type {
  PromotionAdminAction,
  PromotionLog,
  PromotionType,
} from "@/store/api/adminTypes";
import { getApiError } from "@/store/api/apiError";
import { DEFAULT_LIMIT } from "@/store/api/pagination";
import { DataTable } from "@/components/admin/DataTable";
import { Pagination } from "@/components/admin/Pagination";
import type { Column } from "@/lib/table";
import { formatDateTime, shortId } from "@/lib/format";
import { PROMOTION_TYPE_BADGE, PROMOTION_TYPE_LABELS } from "@/lib/promotions";
import { PROMOTION_ADMIN_ACTION_LABELS } from "@/lib/logs";
import {
  FilterGrid,
  FilterSelect,
  TextFilter,
  filterOptions,
  useDebouncedValue,
} from "@/components/admin/logs/filters";

/**
 * ADMIN-14 — журнал промо-действий (`GET /admin/promotion-logs`, API.md §16).
 *
 * Аудит ручных операций админа над VIP/TOP (`promotion_logs`, TASK-121/122).
 * Фильтры: `listing_id`/`admin_id` (текст) + `action` (enum-селект). Переходы
 * тира (`old → new`) и срока показываем компактно; `null` рендерим прочерком.
 */

const SEARCH_DEBOUNCE_MS = 300;

const ACTION_OPTIONS = filterOptions(
  PROMOTION_ADMIN_ACTION_LABELS,
  "Все действия",
);

/** Бейдж тира промо (или прочерк). */
function TypeBadge({ type }: { type: PromotionType | null }) {
  if (!type) return <span className="text-gray-400">—</span>;
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-theme-xs font-medium ${PROMOTION_TYPE_BADGE[type]}`}
    >
      {PROMOTION_TYPE_LABELS[type]}
    </span>
  );
}

export function PromotionLogsTab() {
  const [listingIdInput, setListingIdInput] = useState("");
  const [adminIdInput, setAdminIdInput] = useState("");
  const [action, setAction] = useState<PromotionAdminAction | "">("");
  const [page, setPage] = useState(1);

  const listingId = useDebouncedValue(listingIdInput.trim(), SEARCH_DEBOUNCE_MS);
  const adminId = useDebouncedValue(adminIdInput.trim(), SEARCH_DEBOUNCE_MS);

  useEffect(() => {
    setPage(1);
  }, [listingId, adminId, action]);

  const { data, isLoading, isFetching, isError, error, refetch } =
    useListPromotionLogsQuery({
      listing_id: listingId || undefined,
      admin_id: adminId || undefined,
      action: action || undefined,
      page,
      limit: DEFAULT_LIMIT,
    });

  const columns = useMemo<Column<PromotionLog>[]>(
    () => [
      {
        key: "listing_id",
        header: "Листинг",
        render: (row) => (
          <Link
            href={`/admin/listings/${row.listing_id}`}
            className="font-medium text-gray-700 transition hover:text-brand-500 dark:text-gray-300"
            title={row.listing_id}
          >
            {shortId(row.listing_id)}
          </Link>
        ),
      },
      {
        key: "action",
        header: "Действие",
        render: (row) => (
          <span className="text-gray-700 dark:text-gray-300">
            {PROMOTION_ADMIN_ACTION_LABELS[row.action]}
          </span>
        ),
      },
      {
        key: "type",
        header: "Тип",
        align: "center",
        render: (row) => (
          <div className="flex items-center justify-center gap-1.5">
            <TypeBadge type={row.old_type} />
            <span className="text-gray-400">→</span>
            <TypeBadge type={row.new_type} />
          </div>
        ),
      },
      {
        key: "expires",
        header: "Срок",
        align: "right",
        render: (row) => (
          <div className="flex flex-col items-end text-theme-xs text-gray-500 dark:text-gray-400">
            <span className="whitespace-nowrap">
              {formatDateTime(row.old_expires_at)}
            </span>
            <span className="whitespace-nowrap text-gray-700 dark:text-gray-300">
              → {formatDateTime(row.new_expires_at)}
            </span>
          </div>
        ),
      },
      {
        key: "admin_id",
        header: "Админ",
        render: (row) => (
          <span
            className="text-theme-xs text-gray-500 dark:text-gray-400"
            title={row.admin_id ?? undefined}
          >
            {row.admin_id ? shortId(row.admin_id) : "—"}
          </span>
        ),
      },
      {
        key: "created_at",
        header: "Когда",
        align: "right",
        render: (row) => (
          <span className="whitespace-nowrap text-theme-xs text-gray-500 dark:text-gray-400">
            {formatDateTime(row.created_at)}
          </span>
        ),
      },
    ],
    [],
  );

  const errorMessage = isError
    ? (getApiError(error)?.message ?? "Не удалось загрузить журнал промо.")
    : undefined;

  return (
    <div className="space-y-5">
      {isFetching && (
        <span className="text-theme-xs text-gray-400">Обновление…</span>
      )}

      <FilterGrid>
        <TextFilter
          label="ID листинга"
          value={listingIdInput}
          placeholder="UUID"
          onChange={setListingIdInput}
        />
        <TextFilter
          label="ID админа"
          value={adminIdInput}
          placeholder="UUID"
          onChange={setAdminIdInput}
        />
        <FilterSelect
          label="Действие"
          value={action}
          options={ACTION_OPTIONS}
          onChange={setAction}
        />
      </FilterGrid>

      <DataTable
        columns={columns}
        rows={data?.data}
        getRowKey={(row) => row.id}
        isLoading={isLoading}
        isError={isError}
        errorMessage={errorMessage}
        onRetry={refetch}
        emptyMessage="По заданным фильтрам записей нет."
      />

      <Pagination meta={data?.meta} page={page} onPageChange={setPage} />
    </div>
  );
}
