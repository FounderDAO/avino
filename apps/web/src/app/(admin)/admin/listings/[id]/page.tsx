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
import { DetailSkeleton, ErrorState, InfoState } from "@/components/admin/states";
import { useToast } from "@/components/admin/toast/ToastProvider";
import type { Column } from "@/lib/table";
import { LISTING_STATUS_BADGE } from "@/lib/labels";
import { formatDateTime, formatPrice, shortId } from "@/lib/format";
import {
  ACTION_REQUIRES_REASON,
  ACTION_TO_STATUS,
  MODERATION_ACTIONS,
  MODERATION_ACTION_INTENT,
  canApplyAction,
  moderationErrorMessage,
} from "@/lib/moderation";
import { useT, useEnumLabels } from "@/lib/i18n";

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
  const enums = useEnumLabels();
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-theme-xs font-medium ${LISTING_STATUS_BADGE[status]}`}
    >
      {enums.listingStatus[status]}
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
  const { t, locale } = useT();
  const enums = useEnumLabels();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const listingQuery = useGetAdminListingQuery(id, { skip: !id });
  const logsQuery = useListingModerationLogsQuery(id, { skip: !id });
  const [moderate, moderation] = useModerateListingMutation();
  const toast = useToast();

  const [pendingAction, setPendingAction] = useState<ModerationAction | null>(
    null,
  );
  const [reason, setReason] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  const listing = listingQuery.data;

  function openDialog(action: ModerationAction) {
    setPendingAction(action);
    setReason("");
    setActionError(null);
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
      setActionError(t("listings.reasonMissing"));
      return;
    }
    try {
      const result = await moderate({
        id,
        body: { action: pendingAction, reason: trimmed || null },
      }).unwrap();
      toast.success(
        t("listings.statusChanged", {
          status: enums.listingStatus[result.status],
        }),
      );
      setPendingAction(null);
      setReason("");
      setActionError(null);
    } catch (err) {
      toast.error(
        moderationErrorMessage(
          err as Parameters<typeof moderationErrorMessage>[0],
          locale,
        ),
      );
    }
  }

  const logColumns = useMemo<Column<ListingModerationLogEntry>[]>(
    () => [
      {
        key: "action",
        header: t("listings.colAction"),
        render: (row) => enums.moderationAction[row.action],
      },
      {
        key: "transition",
        header: t("listings.colTransition"),
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
        header: t("listings.colModerator"),
        render: (row) => (
          <span className="text-theme-xs text-gray-500 dark:text-gray-400">
            {row.moderator_id ? shortId(row.moderator_id) : "—"}
          </span>
        ),
      },
      {
        key: "reason",
        header: t("listings.colReason"),
        render: (row) => row.reason || "—",
      },
      {
        key: "created_at",
        header: t("listings.colWhen"),
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
            {t("listings.backToQueue")}
          </Link>
          <h1 className="text-title-sm font-bold text-gray-900 dark:text-white">
            {listing?.title || t("listings.cardTitle")}
          </h1>
          <span className="text-theme-xs text-gray-400">
            {shortId(id)}
            {listing
              ? t("listings.languageSuffix", { language: listing.language })
              : ""}
          </span>
        </div>
        {listing && <StatusBadge status={listing.status} />}
      </div>

      {listingQuery.isLoading && <DetailSkeleton />}

      {notFound && <InfoState message={t("listings.notFound")} />}

      {listingQuery.isError && !notFound && (
        <ErrorState
          message={
            getApiError(listingQuery.error)?.message ??
            t("listings.detailLoadError")
          }
          onRetry={() => listingQuery.refetch()}
        />
      )}

      {listing && (
        <>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Данные + медиа + история */}
          <div className="space-y-6 lg:col-span-2">
            <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
              <h2 className="mb-2 text-theme-sm font-semibold text-gray-800 dark:text-white/90">
                {t("listings.sectionData")}
              </h2>
              <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
                <Field label={t("listings.fieldPropertyType")}>
                  {enums.propertyType[listing.property_type]}
                </Field>
                <Field label={t("listings.fieldTransactionType")}>
                  {enums.transactionType[listing.transaction_type]}
                </Field>
                <Field label={t("listings.fieldPrice")}>
                  {formatPrice(listing.price, listing.currency)}
                </Field>
                <Field label={t("listings.fieldArea")}>
                  {listing.area
                    ? t("listings.areaValue", { area: listing.area })
                    : "—"}
                </Field>
                <Field label={t("listings.fieldRooms")}>
                  {listing.rooms ?? "—"}
                </Field>
                <Field label={t("listings.fieldFloor")}>
                  {floorText(listing)}
                </Field>
                <Field label={t("listings.fieldYearBuilt")}>
                  {listing.year_built ?? "—"}
                </Field>
                <Field label={t("listings.fieldPromotion")}>
                  {listing.promotion_type}
                </Field>
                <Field label={t("listings.fieldCity")}>
                  {listing.city_id ? shortId(listing.city_id) : "—"}
                </Field>
                <Field label={t("listings.fieldDistrict")}>
                  {listing.district_id ? shortId(listing.district_id) : "—"}
                </Field>
                <Field label={t("listings.fieldAddress")}>
                  {listing.address || "—"}
                </Field>
                <Field label={t("listings.fieldCoordinates")}>
                  {listing.latitude && listing.longitude
                    ? `${listing.latitude}, ${listing.longitude}`
                    : "—"}
                </Field>
              </div>

              <div className="mt-2">
                <Field label={t("listings.fieldDescription")}>
                  {listing.description || "—"}
                </Field>
                {listing.address_note && (
                  <Field label={t("listings.fieldAddressNote")}>
                    {listing.address_note}
                  </Field>
                )}
                {listing.features_text && (
                  <Field label={t("listings.fieldFeatures")}>
                    {listing.features_text}
                  </Field>
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
              <h2 className="mb-3 text-theme-sm font-semibold text-gray-800 dark:text-white/90">
                {t("listings.sectionPhotos", { count: listing.media.length })}
              </h2>
              {listing.media.length === 0 ? (
                <p className="text-theme-sm text-gray-500 dark:text-gray-400">
                  {t("listings.noPhotos")}
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
                {t("listings.sectionHistory")}
              </h2>
              <DataTable
                columns={logColumns}
                rows={logsQuery.data}
                getRowKey={(row) => row.id}
                isLoading={logsQuery.isLoading}
                isError={logsQuery.isError}
                errorMessage={t("listings.historyLoadError")}
                onRetry={logsQuery.refetch}
                emptyMessage={t("listings.historyEmpty")}
                skeletonRows={4}
              />
            </section>
          </div>

          {/* Панель действий */}
          <aside className="lg:col-span-1">
            <div className="sticky top-6 space-y-4 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
              <h2 className="text-theme-sm font-semibold text-gray-800 dark:text-white/90">
                {t("listings.sectionActions")}
              </h2>
              <p className="text-theme-xs text-gray-500 dark:text-gray-400">
                {t("listings.currentStatus")}
                <StatusBadge status={listing.status} />
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
                        enabled ? undefined : t("listings.actionUnavailable")
                      }
                    >
                      {enums.moderationAction[action]}
                    </button>
                  );
                })}
              </div>

              <dl className="mt-2 space-y-2 border-t border-gray-100 pt-3 text-theme-xs dark:border-gray-800">
                <div className="flex justify-between gap-2">
                  <dt className="text-gray-400">{t("listings.fieldAuthor")}</dt>
                  <dd className="text-gray-600 dark:text-gray-300">
                    {shortId(listing.owner_id)}
                  </dd>
                </div>
                {listing.agency_id && (
                  <div className="flex justify-between gap-2">
                    <dt className="text-gray-400">
                      {t("listings.fieldAgency")}
                    </dt>
                    <dd className="text-gray-600 dark:text-gray-300">
                      {shortId(listing.agency_id)}
                    </dd>
                  </div>
                )}
                <div className="flex justify-between gap-2">
                  <dt className="text-gray-400">{t("listings.fieldCreated")}</dt>
                  <dd className="text-gray-600 dark:text-gray-300">
                    {formatDateTime(listing.created_at, locale)}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-gray-400">
                    {t("listings.fieldPublished")}
                  </dt>
                  <dd className="text-gray-600 dark:text-gray-300">
                    {formatDateTime(listing.published_at, locale)}
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
              {t("listings.confirmTitle", {
                action: enums.moderationAction[pendingAction],
              })}
            </h3>
            <p className="mt-1 text-theme-sm text-gray-500 dark:text-gray-400">
              {t("listings.newStatus")}
              <StatusBadge status={ACTION_TO_STATUS[pendingAction]} />
            </p>

            <label className="mt-4 flex flex-col gap-1.5">
              <span className="text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                {t("listings.reasonLabel")}
                {ACTION_REQUIRES_REASON[pendingAction]
                  ? t("listings.reasonRequired")
                  : t("listings.reasonOptional")}
              </span>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                maxLength={1000}
                placeholder={t("listings.reasonPlaceholder")}
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
                {t("common.cancel")}
              </button>
              <button
                type="button"
                onClick={confirmAction}
                disabled={moderation.isLoading}
                className={`rounded-lg px-4 py-2 text-theme-sm font-medium transition disabled:cursor-not-allowed ${MODERATION_ACTION_INTENT[pendingAction]}`}
              >
                {moderation.isLoading
                  ? t("common.applying")
                  : enums.moderationAction[pendingAction]}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
