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
import { LISTING_STATUS_BADGE } from "@/lib/labels";
import { useT, useEnumLabels, type EnumLabels } from "@/lib/i18n";
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

/** Бейдж статуса листинга (или прочерк, если статус неизвестен). */
function StatusBadge({
  status,
  labels,
}: {
  status: ListingStatus | null;
  labels: EnumLabels["listingStatus"];
}) {
  if (!status) return <span className="text-gray-400">—</span>;
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-theme-xs font-medium ${LISTING_STATUS_BADGE[status]}`}
    >
      {labels[status]}
    </span>
  );
}

export function ModerationLogsTab() {
  const { t, locale } = useT();
  const enums = useEnumLabels();
  const actionOptions = useMemo(
    () => filterOptions(enums.moderationAction, t("logs.filters.allActions")),
    [enums, t],
  );

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
        header: t("logs.cols.listing"),
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
        header: t("logs.cols.action"),
        render: (row) => (
          <span className="text-gray-700 dark:text-gray-300">
            {enums.moderationAction[row.action]}
          </span>
        ),
      },
      {
        key: "transition",
        header: t("logs.cols.status"),
        align: "center",
        render: (row) => (
          <div className="flex items-center justify-center gap-1.5">
            <StatusBadge status={row.old_status} labels={enums.listingStatus} />
            <span className="text-gray-400">→</span>
            <StatusBadge status={row.new_status} labels={enums.listingStatus} />
          </div>
        ),
      },
      {
        key: "moderator_id",
        header: t("logs.cols.moderator"),
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
        header: t("logs.cols.reason"),
        render: (row) => (
          <span className="line-clamp-2 max-w-xs text-theme-xs text-gray-500 dark:text-gray-400">
            {row.reason ?? "—"}
          </span>
        ),
      },
      {
        key: "created_at",
        header: t("logs.cols.when"),
        align: "right",
        render: (row) => (
          <span className="whitespace-nowrap text-theme-xs text-gray-500 dark:text-gray-400">
            {formatDateTime(row.created_at, locale)}
          </span>
        ),
      },
    ],
    [t, locale, enums],
  );

  const errorMessage = isError
    ? (getApiError(error)?.message ?? t("logs.errors.moderation"))
    : undefined;

  return (
    <div className="space-y-5">
      {isFetching && (
        <span className="text-theme-xs text-gray-400">
          {t("common.updating")}
        </span>
      )}

      <FilterGrid>
        <TextFilter
          label={t("logs.filters.listingId")}
          value={listingIdInput}
          placeholder={t("logs.filters.uuidPlaceholder")}
          onChange={setListingIdInput}
        />
        <TextFilter
          label={t("logs.filters.moderatorId")}
          value={moderatorIdInput}
          placeholder={t("logs.filters.uuidPlaceholder")}
          onChange={setModeratorIdInput}
        />
        <FilterSelect
          label={t("logs.filters.action")}
          value={action}
          options={actionOptions}
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
        emptyMessage={t("logs.empty")}
      />

      <Pagination meta={data?.meta} page={page} onPageChange={setPage} />
    </div>
  );
}
