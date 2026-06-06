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
import { LISTING_STATUS_BADGE } from "@/lib/labels";
import { formatDateTime, formatPrice, shortId } from "@/lib/format";
import { useT, useEnumLabels } from "@/lib/i18n";

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
  const { t, locale } = useT();
  const enums = useEnumLabels();

  const STATUS_OPTIONS: SelectOption<ListingStatus | "">[] = [
    { value: "", label: t("listings.allStatuses") },
    ...optionsFromLabels(enums.listingStatus),
  ];
  const PROPERTY_OPTIONS: SelectOption<PropertyType | "">[] = [
    { value: "", label: t("listings.allPropertyTypes") },
    ...optionsFromLabels(enums.propertyType),
  ];
  const TRANSACTION_OPTIONS: SelectOption<TransactionType | "">[] = [
    { value: "", label: t("listings.allTransactionTypes") },
    ...optionsFromLabels(enums.transactionType),
  ];

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
        header: t("listings.colListing"),
        render: (row) => (
          <div className="flex flex-col">
            <Link
              href={`/admin/listings/${row.id}`}
              className="font-medium text-gray-800 transition hover:text-brand-500 dark:text-white/90"
            >
              {row.title || t("listings.untitled")}
            </Link>
            <span className="text-theme-xs text-gray-400">
              {shortId(row.id)} · {row.original_language}
            </span>
          </div>
        ),
      },
      {
        key: "type",
        header: t("listings.colType"),
        render: (row) => (
          <div className="flex flex-col">
            <span>{enums.propertyType[row.property_type]}</span>
            <span className="text-theme-xs text-gray-400">
              {enums.transactionType[row.transaction_type]}
            </span>
          </div>
        ),
      },
      {
        key: "price",
        header: t("listings.colPrice"),
        align: "right",
        render: (row) => (
          <span className="whitespace-nowrap font-medium text-gray-800 dark:text-white/90">
            {formatPrice(row.price, row.currency)}
          </span>
        ),
      },
      {
        key: "status",
        header: t("listings.colStatus"),
        align: "center",
        render: (row) => (
          <span
            className={`inline-flex rounded-full px-2.5 py-0.5 text-theme-xs font-medium ${LISTING_STATUS_BADGE[row.status]}`}
          >
            {enums.listingStatus[row.status]}
          </span>
        ),
      },
      {
        key: "owner_id",
        header: t("listings.colAuthor"),
        render: (row) => (
          <span className="text-theme-xs text-gray-500 dark:text-gray-400">
            {shortId(row.owner_id)}
          </span>
        ),
      },
      {
        key: "created_at",
        header: t("listings.colCreated"),
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
    ? (getApiError(error)?.message ?? t("listings.loadError"))
    : undefined;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-title-sm font-bold text-gray-900 dark:text-white">
            {t("listings.title")}
          </h1>
          <p className="mt-1 text-theme-sm text-gray-500 dark:text-gray-400">
            {t("listings.subtitle")}
          </p>
        </div>
        {isFetching && (
          <span className="text-theme-xs text-gray-400">
            {t("common.updating")}
          </span>
        )}
      </div>

      {/* Фильтры */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <FilterSelect
          label={t("listings.statusLabel")}
          value={status}
          options={STATUS_OPTIONS}
          onChange={setStatus}
        />
        <FilterSelect
          label={t("listings.propertyTypeLabel")}
          value={propertyType}
          options={PROPERTY_OPTIONS}
          onChange={setPropertyType}
        />
        <FilterSelect
          label={t("listings.transactionTypeLabel")}
          value={transactionType}
          options={TRANSACTION_OPTIONS}
          onChange={setTransactionType}
        />
        <label className="flex flex-col gap-1.5">
          <span className="text-theme-xs font-medium text-gray-500 dark:text-gray-400">
            {t("listings.searchLabel")}
          </span>
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={t("listings.searchPlaceholder")}
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
        emptyMessage={t("listings.empty")}
      />

      <Pagination meta={data?.meta} page={page} onPageChange={setPage} />
    </div>
  );
}
