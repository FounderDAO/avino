"use client";

import { useEffect, useMemo, useState } from "react";

import { useListNotificationLogsQuery } from "@/store/api/adminLogsApi";
import type {
  NotificationChannel,
  NotificationLog,
  NotificationStatus,
  NotificationType,
} from "@/store/api/adminTypes";
import { getApiError } from "@/store/api/apiError";
import { DEFAULT_LIMIT } from "@/store/api/pagination";
import { DataTable } from "@/components/admin/DataTable";
import { Pagination } from "@/components/admin/Pagination";
import type { Column } from "@/lib/table";
import { formatDateTime, shortId } from "@/lib/format";
import { NOTIFICATION_STATUS_BADGE } from "@/lib/logs";
import { useT, useEnumLabels } from "@/lib/i18n";
import {
  FilterGrid,
  FilterSelect,
  TextFilter,
  filterOptions,
  useDebouncedValue,
} from "@/components/admin/logs/filters";

/**
 * ADMIN-14 — журнал уведомлений (`GET /admin/notification-logs`, API.md §16).
 *
 * Глобальный журнал доставки (`notifications`). Фильтры: `user_id` (текст) +
 * `type`/`channel`/`status` (enum-селекты). Статус доставки — цветной бейдж.
 */

const SEARCH_DEBOUNCE_MS = 300;

export function NotificationLogsTab() {
  const { t, locale } = useT();
  const enums = useEnumLabels();

  const typeOptions = useMemo(
    () => filterOptions(enums.notificationType, t("logs.filters.allTypes")),
    [enums, t],
  );
  const channelOptions = useMemo(
    () =>
      filterOptions(enums.notificationChannel, t("logs.filters.allChannels")),
    [enums, t],
  );
  const statusOptions = useMemo(
    () =>
      filterOptions(enums.notificationStatus, t("logs.filters.allStatuses")),
    [enums, t],
  );

  const [userIdInput, setUserIdInput] = useState("");
  const [type, setType] = useState<NotificationType | "">("");
  const [channel, setChannel] = useState<NotificationChannel | "">("");
  const [status, setStatus] = useState<NotificationStatus | "">("");
  const [page, setPage] = useState(1);

  const userId = useDebouncedValue(userIdInput.trim(), SEARCH_DEBOUNCE_MS);

  useEffect(() => {
    setPage(1);
  }, [userId, type, channel, status]);

  const { data, isLoading, isFetching, isError, error, refetch } =
    useListNotificationLogsQuery({
      user_id: userId || undefined,
      type: type || undefined,
      channel: channel || undefined,
      status: status || undefined,
      page,
      limit: DEFAULT_LIMIT,
    });

  const columns = useMemo<Column<NotificationLog>[]>(
    () => [
      {
        key: "type",
        header: t("logs.cols.type"),
        render: (row) => (
          <div className="flex flex-col">
            <span className="text-gray-700 dark:text-gray-300">
              {enums.notificationType[row.type]}
            </span>
            {row.title && (
              <span className="line-clamp-1 max-w-xs text-theme-xs text-gray-400">
                {row.title}
              </span>
            )}
          </div>
        ),
      },
      {
        key: "user_id",
        header: t("logs.cols.user"),
        render: (row) => (
          <span
            className="text-theme-xs text-gray-500 dark:text-gray-400"
            title={row.user_id}
          >
            {shortId(row.user_id)}
          </span>
        ),
      },
      {
        key: "channel",
        header: t("logs.cols.channel"),
        align: "center",
        render: (row) => (
          <span className="text-theme-xs text-gray-600 dark:text-gray-400">
            {enums.notificationChannel[row.channel]}
          </span>
        ),
      },
      {
        key: "status",
        header: t("logs.cols.status"),
        align: "center",
        render: (row) => (
          <span
            className={`inline-flex rounded-full px-2.5 py-0.5 text-theme-xs font-medium ${NOTIFICATION_STATUS_BADGE[row.status]}`}
          >
            {enums.notificationStatus[row.status]}
          </span>
        ),
      },
      {
        key: "sent_at",
        header: t("logs.cols.sentAt"),
        align: "right",
        render: (row) => (
          <span className="whitespace-nowrap text-theme-xs text-gray-500 dark:text-gray-400">
            {formatDateTime(row.sent_at, locale)}
          </span>
        ),
      },
      {
        key: "created_at",
        header: t("logs.cols.createdAt"),
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
    ? (getApiError(error)?.message ?? t("logs.errors.notification"))
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
          label={t("logs.filters.userId")}
          value={userIdInput}
          placeholder={t("logs.filters.uuidPlaceholder")}
          onChange={setUserIdInput}
        />
        <FilterSelect
          label={t("logs.filters.type")}
          value={type}
          options={typeOptions}
          onChange={setType}
        />
        <FilterSelect
          label={t("logs.filters.channel")}
          value={channel}
          options={channelOptions}
          onChange={setChannel}
        />
        <FilterSelect
          label={t("logs.filters.status")}
          value={status}
          options={statusOptions}
          onChange={setStatus}
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
