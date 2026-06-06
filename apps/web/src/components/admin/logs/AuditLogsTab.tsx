"use client";

import { useEffect, useMemo, useState } from "react";

import { useListAuditLogsQuery } from "@/store/api/adminLogsApi";
import type { AuditLog } from "@/store/api/adminTypes";
import { getApiError } from "@/store/api/apiError";
import { DEFAULT_LIMIT } from "@/store/api/pagination";
import { DataTable } from "@/components/admin/DataTable";
import { Pagination } from "@/components/admin/Pagination";
import type { Column } from "@/lib/table";
import { formatDateTime, shortId } from "@/lib/format";
import {
  FilterGrid,
  TextFilter,
  useDebouncedValue,
} from "@/components/admin/logs/filters";

/**
 * ADMIN-14 — журнал аудита (`GET /admin/audit-logs`, API.md §16).
 *
 * Security audit-лог (`audit_logs`, ADR-004): `action`/`entity_type` — free-form
 * строки, поэтому все четыре фильтра текстовые (без enum-селектов). Текстовый
 * ввод дебаунсится; любая смена фильтра сбрасывает страницу на 1.
 */

const SEARCH_DEBOUNCE_MS = 300;

export function AuditLogsTab() {
  const [actionInput, setActionInput] = useState("");
  const [entityTypeInput, setEntityTypeInput] = useState("");
  const [actorIdInput, setActorIdInput] = useState("");
  const [entityIdInput, setEntityIdInput] = useState("");
  const [page, setPage] = useState(1);

  const action = useDebouncedValue(actionInput.trim(), SEARCH_DEBOUNCE_MS);
  const entityType = useDebouncedValue(
    entityTypeInput.trim(),
    SEARCH_DEBOUNCE_MS,
  );
  const actorId = useDebouncedValue(actorIdInput.trim(), SEARCH_DEBOUNCE_MS);
  const entityId = useDebouncedValue(entityIdInput.trim(), SEARCH_DEBOUNCE_MS);

  useEffect(() => {
    setPage(1);
  }, [action, entityType, actorId, entityId]);

  const { data, isLoading, isFetching, isError, error, refetch } =
    useListAuditLogsQuery({
      action: action || undefined,
      entity_type: entityType || undefined,
      actor_id: actorId || undefined,
      entity_id: entityId || undefined,
      page,
      limit: DEFAULT_LIMIT,
    });

  const columns = useMemo<Column<AuditLog>[]>(
    () => [
      {
        key: "action",
        header: "Действие",
        render: (row) => (
          <span className="inline-flex rounded-md bg-gray-100 px-2 py-0.5 font-mono text-theme-xs text-gray-700 dark:bg-gray-800 dark:text-gray-300">
            {row.action}
          </span>
        ),
      },
      {
        key: "entity",
        header: "Сущность",
        render: (row) => (
          <div className="flex flex-col">
            <span className="text-gray-700 dark:text-gray-300">
              {row.entity_type ?? "—"}
            </span>
            {row.entity_id && (
              <span
                className="text-theme-xs text-gray-400"
                title={row.entity_id}
              >
                {shortId(row.entity_id)}
              </span>
            )}
          </div>
        ),
      },
      {
        key: "actor_id",
        header: "Актор",
        render: (row) => (
          <span
            className="text-theme-xs text-gray-500 dark:text-gray-400"
            title={row.actor_id ?? undefined}
          >
            {row.actor_id ? shortId(row.actor_id) : "Система"}
          </span>
        ),
      },
      {
        key: "ip",
        header: "IP",
        render: (row) => (
          <span className="font-mono text-theme-xs text-gray-500 dark:text-gray-400">
            {row.ip ?? "—"}
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
    ? (getApiError(error)?.message ?? "Не удалось загрузить журнал аудита.")
    : undefined;

  return (
    <div className="space-y-5">
      {isFetching && (
        <span className="text-theme-xs text-gray-400">Обновление…</span>
      )}

      <FilterGrid>
        <TextFilter
          label="Действие"
          value={actionInput}
          placeholder="ROLE_CHANGE, LISTING_STATUS_CHANGE…"
          onChange={setActionInput}
        />
        <TextFilter
          label="Тип сущности"
          value={entityTypeInput}
          placeholder="user, listing…"
          onChange={setEntityTypeInput}
        />
        <TextFilter
          label="ID актора"
          value={actorIdInput}
          placeholder="UUID"
          onChange={setActorIdInput}
        />
        <TextFilter
          label="ID сущности"
          value={entityIdInput}
          placeholder="UUID"
          onChange={setEntityIdInput}
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
