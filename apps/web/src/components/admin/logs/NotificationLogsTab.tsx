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
import {
  NOTIFICATION_CHANNEL_LABELS,
  NOTIFICATION_STATUS_BADGE,
  NOTIFICATION_STATUS_LABELS,
  NOTIFICATION_TYPE_LABELS,
} from "@/lib/logs";
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

const TYPE_OPTIONS = filterOptions(NOTIFICATION_TYPE_LABELS, "Все типы");
const CHANNEL_OPTIONS = filterOptions(NOTIFICATION_CHANNEL_LABELS, "Все каналы");
const STATUS_OPTIONS = filterOptions(NOTIFICATION_STATUS_LABELS, "Все статусы");

export function NotificationLogsTab() {
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
        header: "Тип",
        render: (row) => (
          <div className="flex flex-col">
            <span className="text-gray-700 dark:text-gray-300">
              {NOTIFICATION_TYPE_LABELS[row.type]}
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
        header: "Пользователь",
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
        header: "Канал",
        align: "center",
        render: (row) => (
          <span className="text-theme-xs text-gray-600 dark:text-gray-400">
            {NOTIFICATION_CHANNEL_LABELS[row.channel]}
          </span>
        ),
      },
      {
        key: "status",
        header: "Статус",
        align: "center",
        render: (row) => (
          <span
            className={`inline-flex rounded-full px-2.5 py-0.5 text-theme-xs font-medium ${NOTIFICATION_STATUS_BADGE[row.status]}`}
          >
            {NOTIFICATION_STATUS_LABELS[row.status]}
          </span>
        ),
      },
      {
        key: "sent_at",
        header: "Отправлено",
        align: "right",
        render: (row) => (
          <span className="whitespace-nowrap text-theme-xs text-gray-500 dark:text-gray-400">
            {formatDateTime(row.sent_at)}
          </span>
        ),
      },
      {
        key: "created_at",
        header: "Создано",
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
    ? (getApiError(error)?.message ?? "Не удалось загрузить журнал уведомлений.")
    : undefined;

  return (
    <div className="space-y-5">
      {isFetching && (
        <span className="text-theme-xs text-gray-400">Обновление…</span>
      )}

      <FilterGrid>
        <TextFilter
          label="ID пользователя"
          value={userIdInput}
          placeholder="UUID"
          onChange={setUserIdInput}
        />
        <FilterSelect
          label="Тип"
          value={type}
          options={TYPE_OPTIONS}
          onChange={setType}
        />
        <FilterSelect
          label="Канал"
          value={channel}
          options={CHANNEL_OPTIONS}
          onChange={setChannel}
        />
        <FilterSelect
          label="Статус"
          value={status}
          options={STATUS_OPTIONS}
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
        emptyMessage="По заданным фильтрам записей нет."
      />

      <Pagination meta={data?.meta} page={page} onPageChange={setPage} />
    </div>
  );
}
