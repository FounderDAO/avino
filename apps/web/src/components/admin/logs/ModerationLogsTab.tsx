"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { useListModerationLogsQuery } from "@/store/api/adminLogsApi";
import type {
  ListingStatus,
  ModerationAction,
  ModerationLog,
} from "@/store/api/adminTypes";
import { getApiError } from "@/store/api/apiError";
import { DEFAULT_LIMIT } from "@/store/api/pagination";
import { DataTable } from "@/components/admin/DataTable";
import { Pagination } from "@/components/admin/Pagination";
import type { Column } from "@/lib/table";
import { formatDateTime, shortId } from "@/lib/format";
import { LISTING_STATUS_BADGE, LISTING_STATUS_LABELS } from "@/lib/labels";
import { MODERATION_ACTION_LABELS } from "@/lib/moderation";
import {
  FilterGrid,
  FilterSelect,
  TextFilter,
  filterOptions,
  useDebouncedValue,
} from "@/components/admin/logs/filters";

/**
 * ADMIN-14 — журнал модерации (`GET /admin/moderation-logs`, API.md §16).
 *
 * Глобальный журнал по всем объявлениям (в отличие от per-listing истории в
 * карточке, ADMIN-09). Фильтры: `listing_id`/`moderator_id` (текст) + `action`
 * (enum-селект). Переход статуса показываем как `old → new` бейджами.
 */

const SEARCH_DEBOUNCE_MS = 300;

const ACTION_OPTIONS = filterOptions(MODERATION_ACTION_LABELS, "Все действия");

/** Бейдж статуса листинга (или прочерк, если статус неизвестен). */
function StatusBadge({ status }: { status: ListingStatus | null }) {
  if (!status) return <span className="text-gray-400">—</span>;
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-theme-xs font-medium ${LISTING_STATUS_BADGE[status]}`}
    >
      {LISTING_STATUS_LABELS[status]}
    </span>
  );
}

export function ModerationLogsTab() {
  const [listingIdInput, setListingIdInput] = useState("");
  const [moderatorIdInput, setModeratorIdInput] = useState("");
  const [action, setAction] = useState<ModerationAction | "">("");
  const [page, setPage] = useState(1);

  const listingId = useDebouncedValue(listingIdInput.trim(), SEARCH_DEBOUNCE_MS);
  const moderatorId = useDebouncedValue(
    moderatorIdInput.trim(),
    SEARCH_DEBOUNCE_MS,
  );

  useEffect(() => {
    setPage(1);
  }, [listingId, moderatorId, action]);

  const { data, isLoading, isFetching, isError, error, refetch } =
    useListModerationLogsQuery({
      listing_id: listingId || undefined,
      moderator_id: moderatorId || undefined,
      action: action || undefined,
      page,
      limit: DEFAULT_LIMIT,
    });

  const columns = useMemo<Column<ModerationLog>[]>(
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
            {MODERATION_ACTION_LABELS[row.action]}
          </span>
        ),
      },
      {
        key: "transition",
        header: "Статус",
        align: "center",
        render: (row) => (
          <div className="flex items-center justify-center gap-1.5">
            <StatusBadge status={row.old_status} />
            <span className="text-gray-400">→</span>
            <StatusBadge status={row.new_status} />
          </div>
        ),
      },
      {
        key: "moderator_id",
        header: "Модератор",
        render: (row) => (
          <span
            className="text-theme-xs text-gray-500 dark:text-gray-400"
            title={row.moderator_id ?? undefined}
          >
            {row.moderator_id ? shortId(row.moderator_id) : "—"}
          </span>
        ),
      },
      {
        key: "reason",
        header: "Причина",
        render: (row) => (
          <span className="line-clamp-2 max-w-xs text-theme-xs text-gray-500 dark:text-gray-400">
            {row.reason ?? "—"}
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
    ? (getApiError(error)?.message ?? "Не удалось загрузить журнал модерации.")
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
          label="ID модератора"
          value={moderatorIdInput}
          placeholder="UUID"
          onChange={setModeratorIdInput}
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
