"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import {
  useGetAdminListingQuery,
  useListingModerationLogsQuery,
  useModerateListingMutation,
} from "@/store/api/adminListingsApi";
import type {
  ListingDetail,
  ListingModerationLogEntry,
  ListingStatus,
  ModerationAction,
} from "@/store/api/adminTypes";
import { getApiError, getApiErrorCode } from "@/store/api/apiError";
import { DataTable } from "@/components/admin/DataTable";
import { PromotionsPanel } from "@/components/admin/PromotionsPanel";
import type { Column } from "@/lib/table";
import {
  LISTING_STATUS_BADGE,
  LISTING_STATUS_LABELS,
  PROPERTY_TYPE_LABELS,
  TRANSACTION_TYPE_LABELS,
} from "@/lib/labels";
import { formatDateTime, formatPrice, shortId } from "@/lib/format";
import {
  ACTION_REQUIRES_REASON,
  ACTION_TO_STATUS,
  MODERATION_ACTIONS,
  MODERATION_ACTION_INTENT,
  MODERATION_ACTION_LABELS,
  canApplyAction,
  moderationErrorMessage,
} from "@/lib/moderation";

/**
 * ADMIN-09 — карточка модерации (`/admin/listings/[id]`, API.md §7/§16).
 *
 * Данные листинга (`GET /listings/:id` — MODERATOR/ADMIN видят непубличные
 * статусы), действия модерации (`PATCH .../status` с reason для REJECT) и
 * история (`GET .../moderation-logs`). Недопустимые для текущего статуса
 * действия задизейблены (зеркало бэкенда), `422` обрабатывается как fallback.
 * После действия кэш `Admin` инвалидируется — карточка/история/очередь
 * перечитываются. Данные — только через RTK Query (CLAUDE.md §4). RU-only.
 */

/** Бейдж статуса листинга. */
function StatusBadge({ status }: { status: ListingStatus }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-theme-xs font-medium ${LISTING_STATUS_BADGE[status]}`}
    >
      {LISTING_STATUS_LABELS[status]}
    </span>
  );
}

/** Строка «подпись → значение» в карточке деталей. */
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-gray-100 py-2.5 last:border-0 dark:border-gray-800">
      <span className="text-theme-xs font-medium text-gray-400">{label}</span>
      <span className="text-theme-sm text-gray-800 dark:text-gray-200">
        {children}
      </span>
    </div>
  );
}

function floorText(listing: ListingDetail): string {
  if (listing.floor === null && listing.total_floors === null) return "—";
  const floor = listing.floor ?? "—";
  const total = listing.total_floors ?? "—";
  return `${floor} / ${total}`;
}

export default function AdminListingDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const listingQuery = useGetAdminListingQuery(id, { skip: !id });
  const logsQuery = useListingModerationLogsQuery(id, { skip: !id });
  const [moderate, moderation] = useModerateListingMutation();

  const [pendingAction, setPendingAction] = useState<ModerationAction | null>(
    null,
  );
  const [reason, setReason] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const listing = listingQuery.data;

  function openDialog(action: ModerationAction) {
    setPendingAction(action);
    setReason("");
    setActionError(null);
    setSuccessMessage(null);
  }

  function closeDialog() {
    if (moderation.isLoading) return;
    setPendingAction(null);
    setReason("");
    setActionError(null);
  }

  async function confirmAction() {
    if (!pendingAction) return;
    const trimmed = reason.trim();
    if (ACTION_REQUIRES_REASON[pendingAction] && !trimmed) {
      setActionError("Укажите причину отклонения.");
      return;
    }
    try {
      const result = await moderate({
        id,
        body: { action: pendingAction, reason: trimmed || null },
      }).unwrap();
      setSuccessMessage(
        `Статус изменён: ${LISTING_STATUS_LABELS[result.status]}.`,
      );
      setPendingAction(null);
      setReason("");
      setActionError(null);
    } catch (err) {
      setActionError(moderationErrorMessage(err as Parameters<typeof moderationErrorMessage>[0]));
    }
  }

  const logColumns = useMemo<Column<ListingModerationLogEntry>[]>(
    () => [
      {
        key: "action",
        header: "Действие",
        render: (row) => MODERATION_ACTION_LABELS[row.action],
      },
      {
        key: "transition",
        header: "Переход",
        render: (row) => (
          <span className="flex items-center gap-2">
            {row.old_status ? <StatusBadge status={row.old_status} /> : "—"}
            <span className="text-gray-400">→</span>
            {row.new_status ? <StatusBadge status={row.new_status} /> : "—"}
          </span>
        ),
      },
      {
        key: "moderator_id",
        header: "Модератор",
        render: (row) => (
          <span className="text-theme-xs text-gray-500 dark:text-gray-400">
            {row.moderator_id ? shortId(row.moderator_id) : "—"}
          </span>
        ),
      },
      {
        key: "reason",
        header: "Причина",
        render: (row) => row.reason || "—",
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

  // ─── Состояния загрузки/ошибки карточки ─────────────────────────────────
  const notFound =
    listingQuery.isError && getApiErrorCode(listingQuery.error) === "NOT_FOUND";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <Link
            href="/admin/listings"
            className="text-theme-xs font-medium text-gray-500 transition hover:text-brand-500 dark:text-gray-400"
          >
            ← К очереди модерации
          </Link>
          <h1 className="text-title-sm font-bold text-gray-900 dark:text-white">
            {listing?.title || "Карточка объявления"}
          </h1>
          <span className="text-theme-xs text-gray-400">
            {shortId(id)}
            {listing ? ` · язык: ${listing.language}` : ""}
          </span>
        </div>
        {listing && <StatusBadge status={listing.status} />}
      </div>

      {successMessage && (
        <div className="rounded-lg border border-success-200 bg-success-50 px-4 py-3 text-theme-sm text-success-700 dark:border-success-500/30 dark:bg-success-500/[0.12] dark:text-success-400">
          {successMessage}
        </div>
      )}

      {listingQuery.isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-5 w-full max-w-md animate-pulse rounded bg-gray-100 dark:bg-gray-800"
            />
          ))}
        </div>
      )}

      {notFound && (
        <div className="rounded-2xl border border-gray-200 bg-white px-5 py-12 text-center dark:border-gray-800 dark:bg-white/[0.03]">
          <p className="text-theme-sm text-gray-500 dark:text-gray-400">
            Объявление недоступно — удалено или скрыто из выдачи.
          </p>
        </div>
      )}

      {listingQuery.isError && !notFound && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-gray-200 bg-white px-5 py-12 text-center dark:border-gray-800 dark:bg-white/[0.03]">
          <p className="text-theme-sm text-error-600 dark:text-error-500">
            {getApiError(listingQuery.error)?.message ??
              "Не удалось загрузить объявление."}
          </p>
          <button
            type="button"
            onClick={() => listingQuery.refetch()}
            className="rounded-lg border border-gray-300 px-4 py-2 text-theme-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.03]"
          >
            Повторить
          </button>
        </div>
      )}

      {listing && (
        <>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Данные + медиа + история */}
          <div className="space-y-6 lg:col-span-2">
            <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
              <h2 className="mb-2 text-theme-sm font-semibold text-gray-800 dark:text-white/90">
                Данные объявления
              </h2>
              <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
                <Field label="Тип недвижимости">
                  {PROPERTY_TYPE_LABELS[listing.property_type]}
                </Field>
                <Field label="Тип сделки">
                  {TRANSACTION_TYPE_LABELS[listing.transaction_type]}
                </Field>
                <Field label="Цена">
                  {formatPrice(listing.price, listing.currency)}
                </Field>
                <Field label="Площадь">
                  {listing.area ? `${listing.area} м²` : "—"}
                </Field>
                <Field label="Комнаты">{listing.rooms ?? "—"}</Field>
                <Field label="Этаж / этажность">{floorText(listing)}</Field>
                <Field label="Год постройки">{listing.year_built ?? "—"}</Field>
                <Field label="Промо">{listing.promotion_type}</Field>
                <Field label="Город (id)">
                  {listing.city_id ? shortId(listing.city_id) : "—"}
                </Field>
                <Field label="Район (id)">
                  {listing.district_id ? shortId(listing.district_id) : "—"}
                </Field>
                <Field label="Адрес">{listing.address || "—"}</Field>
                <Field label="Координаты">
                  {listing.latitude && listing.longitude
                    ? `${listing.latitude}, ${listing.longitude}`
                    : "—"}
                </Field>
              </div>

              <div className="mt-2">
                <Field label="Описание">{listing.description || "—"}</Field>
                {listing.address_note && (
                  <Field label="Примечание к адресу">
                    {listing.address_note}
                  </Field>
                )}
                {listing.features_text && (
                  <Field label="Дополнительно">{listing.features_text}</Field>
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
              <h2 className="mb-3 text-theme-sm font-semibold text-gray-800 dark:text-white/90">
                Фотографии ({listing.media.length})
              </h2>
              {listing.media.length === 0 ? (
                <p className="text-theme-sm text-gray-500 dark:text-gray-400">
                  Фотографий нет.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                  {listing.media.map((m) => (
                    <a
                      key={m.id}
                      href={m.url}
                      target="_blank"
                      rel="noreferrer"
                      className="block aspect-square overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={m.thumbnail_url ?? m.url}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    </a>
                  ))}
                </div>
              )}
            </section>

            <section className="space-y-3">
              <h2 className="text-theme-sm font-semibold text-gray-800 dark:text-white/90">
                История модерации
              </h2>
              <DataTable
                columns={logColumns}
                rows={logsQuery.data}
                getRowKey={(row) => row.id}
                isLoading={logsQuery.isLoading}
                isError={logsQuery.isError}
                errorMessage="Не удалось загрузить историю модерации."
                onRetry={logsQuery.refetch}
                emptyMessage="Действий модерации ещё не было."
                skeletonRows={4}
              />
            </section>
          </div>

          {/* Панель действий */}
          <aside className="lg:col-span-1">
            <div className="sticky top-6 space-y-4 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
              <h2 className="text-theme-sm font-semibold text-gray-800 dark:text-white/90">
                Действия модерации
              </h2>
              <p className="text-theme-xs text-gray-500 dark:text-gray-400">
                Текущий статус: <StatusBadge status={listing.status} />
              </p>
              <div className="flex flex-col gap-2.5">
                {MODERATION_ACTIONS.map((action) => {
                  const enabled = canApplyAction(action, listing.status);
                  return (
                    <button
                      key={action}
                      type="button"
                      disabled={!enabled || moderation.isLoading}
                      onClick={() => openDialog(action)}
                      className={`rounded-lg px-4 py-2.5 text-theme-sm font-medium transition disabled:cursor-not-allowed ${MODERATION_ACTION_INTENT[action]}`}
                      title={
                        enabled
                          ? undefined
                          : "Действие недоступно для текущего статуса"
                      }
                    >
                      {MODERATION_ACTION_LABELS[action]}
                    </button>
                  );
                })}
              </div>

              <dl className="mt-2 space-y-2 border-t border-gray-100 pt-3 text-theme-xs dark:border-gray-800">
                <div className="flex justify-between gap-2">
                  <dt className="text-gray-400">Автор</dt>
                  <dd className="text-gray-600 dark:text-gray-300">
                    {shortId(listing.owner_id)}
                  </dd>
                </div>
                {listing.agency_id && (
                  <div className="flex justify-between gap-2">
                    <dt className="text-gray-400">Агентство</dt>
                    <dd className="text-gray-600 dark:text-gray-300">
                      {shortId(listing.agency_id)}
                    </dd>
                  </div>
                )}
                <div className="flex justify-between gap-2">
                  <dt className="text-gray-400">Создано</dt>
                  <dd className="text-gray-600 dark:text-gray-300">
                    {formatDateTime(listing.created_at)}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-gray-400">Опубликовано</dt>
                  <dd className="text-gray-600 dark:text-gray-300">
                    {formatDateTime(listing.published_at)}
                  </dd>
                </div>
              </dl>
            </div>
          </aside>
        </div>
        <PromotionsPanel listingId={id} />
        </>
      )}

      {/* Диалог подтверждения действия */}
      {pendingAction && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={closeDialog}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-theme-lg dark:border-gray-800 dark:bg-gray-900"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-theme-lg font-semibold text-gray-900 dark:text-white">
              {MODERATION_ACTION_LABELS[pendingAction]} объявление?
            </h3>
            <p className="mt-1 text-theme-sm text-gray-500 dark:text-gray-400">
              Новый статус:{" "}
              <StatusBadge status={ACTION_TO_STATUS[pendingAction]} />
            </p>

            <label className="mt-4 flex flex-col gap-1.5">
              <span className="text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                Причина
                {ACTION_REQUIRES_REASON[pendingAction]
                  ? " (обязательно)"
                  : " (необязательно)"}
              </span>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                maxLength={1000}
                placeholder="Например: недостаточно фото"
                className="rounded-lg border border-gray-300 bg-transparent px-3 py-2 text-theme-sm text-gray-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-gray-700 dark:text-white"
              />
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
                disabled={moderation.isLoading}
                className="rounded-lg border border-gray-300 px-4 py-2 text-theme-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-40 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.03]"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={confirmAction}
                disabled={moderation.isLoading}
                className={`rounded-lg px-4 py-2 text-theme-sm font-medium transition disabled:cursor-not-allowed ${MODERATION_ACTION_INTENT[pendingAction]}`}
              >
                {moderation.isLoading
                  ? "Применяем…"
                  : MODERATION_ACTION_LABELS[pendingAction]}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
