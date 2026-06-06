"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { useListAdminListingsQuery } from "@/store/api/adminListingsApi";
import type {
  AdminListingRow,
  ListingStatus,
  PropertyType,
  TransactionType,
} from "@/store/api/adminTypes";
import { getApiError } from "@/store/api/apiError";
import { DEFAULT_LIMIT } from "@/store/api/pagination";
import { DataTable } from "@/components/admin/DataTable";
import { Pagination } from "@/components/admin/Pagination";
import type { Column, SelectOption } from "@/lib/table";
import { optionsFromLabels } from "@/lib/table";
import {
  LISTING_STATUS_BADGE,
  LISTING_STATUS_LABELS,
  PROPERTY_TYPE_LABELS,
  TRANSACTION_TYPE_LABELS,
} from "@/lib/labels";
import { formatDateTime, formatPrice, shortId } from "@/lib/format";

/**
 * ADMIN-08 — очередь модерации (`/admin/listings`, API.md §16).
 *
 * Таблица админ-списка листингов с фильтрами (status=NEW по умолчанию,
 * property_type, transaction_type, поиск `q`) и page-based пагинацией. Поиск
 * дебаунсится; любое изменение фильтра сбрасывает страницу на 1. Ссылка с
 * заголовка ведёт на карточку модерации (ADMIN-09). Данные — только через RTK
 * Query (CLAUDE.md §4).
 */

const SEARCH_DEBOUNCE_MS = 300;

const STATUS_OPTIONS: SelectOption<ListingStatus | "">[] = [
  { value: "", label: "Все статусы" },
  ...optionsFromLabels(LISTING_STATUS_LABELS),
];
const PROPERTY_OPTIONS: SelectOption<PropertyType | "">[] = [
  { value: "", label: "Все типы" },
  ...optionsFromLabels(PROPERTY_TYPE_LABELS),
];
const TRANSACTION_OPTIONS: SelectOption<TransactionType | "">[] = [
  { value: "", label: "Все сделки" },
  ...optionsFromLabels(TRANSACTION_TYPE_LABELS),
];

/** Дебаунс значения (для поля поиска). */
function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
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

export default function AdminListingsPage() {
  const [status, setStatus] = useState<ListingStatus | "">("NEW");
  const [propertyType, setPropertyType] = useState<PropertyType | "">("");
  const [transactionType, setTransactionType] = useState<TransactionType | "">(
    "",
  );
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);

  const q = useDebouncedValue(searchInput.trim(), SEARCH_DEBOUNCE_MS);

  // Любая смена фильтров возвращает к первой странице.
  useEffect(() => {
    setPage(1);
  }, [status, propertyType, transactionType, q]);

  const { data, isLoading, isFetching, isError, error, refetch } =
    useListAdminListingsQuery({
      status: status || undefined,
      property_type: propertyType || undefined,
      transaction_type: transactionType || undefined,
      q: q || undefined,
      page,
      limit: DEFAULT_LIMIT,
    });

  const columns = useMemo<Column<AdminListingRow>[]>(
    () => [
      {
        key: "title",
        header: "Объявление",
        render: (row) => (
          <div className="flex flex-col">
            <Link
              href={`/admin/listings/${row.id}`}
              className="font-medium text-gray-800 transition hover:text-brand-500 dark:text-white/90"
            >
              {row.title || "Без названия"}
            </Link>
            <span className="text-theme-xs text-gray-400">
              {shortId(row.id)} · {row.original_language}
            </span>
          </div>
        ),
      },
      {
        key: "type",
        header: "Тип",
        render: (row) => (
          <div className="flex flex-col">
            <span>{PROPERTY_TYPE_LABELS[row.property_type]}</span>
            <span className="text-theme-xs text-gray-400">
              {TRANSACTION_TYPE_LABELS[row.transaction_type]}
            </span>
          </div>
        ),
      },
      {
        key: "price",
        header: "Цена",
        align: "right",
        render: (row) => (
          <span className="whitespace-nowrap font-medium text-gray-800 dark:text-white/90">
            {formatPrice(row.price, row.currency)}
          </span>
        ),
      },
      {
        key: "status",
        header: "Статус",
        align: "center",
        render: (row) => (
          <span
            className={`inline-flex rounded-full px-2.5 py-0.5 text-theme-xs font-medium ${LISTING_STATUS_BADGE[row.status]}`}
          >
            {LISTING_STATUS_LABELS[row.status]}
          </span>
        ),
      },
      {
        key: "owner_id",
        header: "Автор",
        render: (row) => (
          <span className="text-theme-xs text-gray-500 dark:text-gray-400">
            {shortId(row.owner_id)}
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
    ? (getApiError(error)?.message ??
      "Не удалось загрузить очередь модерации.")
    : undefined;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-title-sm font-bold text-gray-900 dark:text-white">
            Модерация объявлений
          </h1>
          <p className="mt-1 text-theme-sm text-gray-500 dark:text-gray-400">
            Очередь и админ-список листингов. По умолчанию — новые на модерации.
          </p>
        </div>
        {isFetching && (
          <span className="text-theme-xs text-gray-400">Обновление…</span>
        )}
      </div>

      {/* Фильтры */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <FilterSelect
          label="Статус"
          value={status}
          options={STATUS_OPTIONS}
          onChange={setStatus}
        />
        <FilterSelect
          label="Тип недвижимости"
          value={propertyType}
          options={PROPERTY_OPTIONS}
          onChange={setPropertyType}
        />
        <FilterSelect
          label="Тип сделки"
          value={transactionType}
          options={TRANSACTION_OPTIONS}
          onChange={setTransactionType}
        />
        <label className="flex flex-col gap-1.5">
          <span className="text-theme-xs font-medium text-gray-500 dark:text-gray-400">
            Поиск
          </span>
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Заголовок объявления"
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
        emptyMessage="По заданным фильтрам объявлений нет."
      />

      <Pagination meta={data?.meta} page={page} onPageChange={setPage} />
    </div>
  );
}
