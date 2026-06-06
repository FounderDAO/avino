"use client";

import { useMemo, useState } from "react";

import {
  useActivatePromotionMutation,
  useCancelPromotionMutation,
  useExtendPromotionMutation,
  useListListingPromotionsQuery,
} from "@/store/api/adminPromotionsApi";
import type {
  ActivatablePromotionType,
  ListingPromotion,
  PromotionPeriodDays,
  PromotionStatus,
  PromotionType,
} from "@/store/api/adminTypes";
import { DataTable } from "@/components/admin/DataTable";
import { useToast } from "@/components/admin/toast/ToastProvider";
import type { Column } from "@/lib/table";
import { formatDateTime } from "@/lib/format";
import { useT, useEnumLabels } from "@/lib/i18n";
import {
  ACTIVATABLE_TYPES,
  PROMOTION_PERIODS,
  PROMOTION_STATUS_BADGE,
  PROMOTION_TYPE_BADGE,
  findActivePromotion,
  newIdempotencyKey,
  periodLabel,
  planPriceLabel,
  promotionErrorMessage,
} from "@/lib/promotions";

/**
 * ADMIN-13 — управление промо VIP/TOP в карточке листинга (API.md §15).
 *
 * Активация тарифа (`POST .../promotions`, идемпотентно по `Idempotency-Key`),
 * продление и отмена активной промо (`PATCH .../listing-promotions/:id/extend|
 * cancel`) и история ledger (`GET .../promotions`). Активация авто-замещает
 * текущую активную промо (бэкенд закрывает предыдущую в той же транзакции).
 * Ошибки мапятся по стабильному `error.code` (`409 ACTIVE_PROMOTION_EXISTS`,
 * `422 INVALID_PERIOD`, `422 PROMOTION_NOT_ACTIVE`). После мутации кэш `Admin`
 * инвалидируется — история и read-cache карточки перечитываются. Данные —
 * только через RTK Query (CLAUDE.md §4). i18n — ADMIN-17.
 */

/** Бейдж тира промо. */
function TypeBadge({ type }: { type: PromotionType }) {
  const enums = useEnumLabels();
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-theme-xs font-medium ${PROMOTION_TYPE_BADGE[type]}`}
    >
      {enums.promotionType[type]}
    </span>
  );
}

/** Бейдж статуса промо. */
function StatusBadge({ status }: { status: PromotionStatus }) {
  const enums = useEnumLabels();
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-theme-xs font-medium ${PROMOTION_STATUS_BADGE[status]}`}
    >
      {enums.promotionStatus[status]}
    </span>
  );
}

export function PromotionsPanel({ listingId }: { listingId: string }) {
  const historyQuery = useListListingPromotionsQuery(listingId, {
    skip: !listingId,
  });
  const [activate, activation] = useActivatePromotionMutation();
  const [cancel, cancellation] = useCancelPromotionMutation();
  const [extend, extension] = useExtendPromotionMutation();
  const toast = useToast();
  const { t, locale } = useT();
  const enums = useEnumLabels();

  // Форма активации.
  const [activateType, setActivateType] =
    useState<ActivatablePromotionType>("VIP");
  const [activatePeriod, setActivatePeriod] = useState<PromotionPeriodDays>(7);

  // Диалоги управления активной промо.
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [extendOpen, setExtendOpen] = useState(false);
  const [extendPeriod, setExtendPeriod] = useState<PromotionPeriodDays>(7);

  const active = findActivePromotion(historyQuery.data);
  const priceLabel = planPriceLabel(activateType, activatePeriod);

  const busy =
    activation.isLoading || cancellation.isLoading || extension.isLoading;

  async function handleActivate() {
    try {
      const result = await activate({
        listingId,
        body: { type: activateType, period_days: activatePeriod },
        idempotencyKey: newIdempotencyKey(),
      }).unwrap();
      toast.success(
        t("promotions.activated", {
          type: enums.promotionType[result.type],
          period: periodLabel(result.period_days, locale),
        }),
      );
    } catch (err) {
      toast.error(
        promotionErrorMessage(
          err as Parameters<typeof promotionErrorMessage>[0],
          locale,
        ),
      );
    }
  }

  async function handleCancel() {
    if (!active) return;
    const trimmed = cancelReason.trim();
    try {
      await cancel({
        id: active.id,
        body: { reason: trimmed || null },
      }).unwrap();
      toast.success(t("promotions.cancelled"));
      setCancelOpen(false);
      setCancelReason("");
    } catch (err) {
      toast.error(
        promotionErrorMessage(
          err as Parameters<typeof promotionErrorMessage>[0],
          locale,
        ),
      );
    }
  }

  async function handleExtend() {
    if (!active) return;
    try {
      const result = await extend({
        id: active.id,
        body: { period_days: extendPeriod },
      }).unwrap();
      toast.success(
        t("promotions.extended", {
          date: formatDateTime(result.expires_at, locale),
        }),
      );
      setExtendOpen(false);
    } catch (err) {
      toast.error(
        promotionErrorMessage(
          err as Parameters<typeof promotionErrorMessage>[0],
          locale,
        ),
      );
    }
  }

  const historyColumns = useMemo<Column<ListingPromotion>[]>(
    () => [
      {
        key: "type",
        header: t("promotions.tier"),
        render: (row) => <TypeBadge type={row.type} />,
      },
      {
        key: "status",
        header: t("promotions.colStatus"),
        render: (row) => <StatusBadge status={row.status} />,
      },
      {
        key: "period_days",
        header: t("promotions.period"),
        render: (row) => periodLabel(row.period_days, locale),
      },
      {
        key: "starts_at",
        header: t("promotions.startsAt"),
        render: (row) => (
          <span className="whitespace-nowrap text-theme-xs text-gray-500 dark:text-gray-400">
            {formatDateTime(row.starts_at, locale)}
          </span>
        ),
      },
      {
        key: "expires_at",
        header: t("promotions.expiresAt"),
        align: "right",
        render: (row) => (
          <span className="whitespace-nowrap text-theme-xs text-gray-500 dark:text-gray-400">
            {formatDateTime(row.expires_at, locale)}
          </span>
        ),
      },
    ],
    [t, locale],
  );

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
      <h2 className="mb-3 text-theme-sm font-semibold text-gray-800 dark:text-white/90">
        {t("promotions.title")}
      </h2>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Активная промо */}
        <div className="rounded-xl border border-gray-100 p-4 dark:border-gray-800">
          <h3 className="mb-2 text-theme-xs font-semibold uppercase tracking-wide text-gray-400">
            {t("promotions.current")}
          </h3>
          {active ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <TypeBadge type={active.type} />
                <StatusBadge status={active.status} />
              </div>
              <dl className="space-y-1.5 text-theme-xs">
                <div className="flex justify-between gap-2">
                  <dt className="text-gray-400">{t("promotions.period")}</dt>
                  <dd className="text-gray-600 dark:text-gray-300">
                    {periodLabel(active.period_days, locale)}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-gray-400">{t("promotions.startsAt")}</dt>
                  <dd className="text-gray-600 dark:text-gray-300">
                    {formatDateTime(active.starts_at, locale)}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-gray-400">{t("promotions.expiresAt")}</dt>
                  <dd className="text-gray-600 dark:text-gray-300">
                    {formatDateTime(active.expires_at, locale)}
                  </dd>
                </div>
              </dl>
              <div className="flex gap-2.5 pt-1">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setExtendPeriod(7);
                    setExtendOpen(true);
                  }}
                  className="rounded-lg bg-brand-500 px-4 py-2 text-theme-sm font-medium text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-brand-500/40"
                >
                  {t("promotions.extend")}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setCancelReason("");
                    setCancelOpen(true);
                  }}
                  className="rounded-lg bg-error-500 px-4 py-2 text-theme-sm font-medium text-white transition hover:bg-error-600 disabled:cursor-not-allowed disabled:bg-error-500/40"
                >
                  {t("promotions.cancel")}
                </button>
              </div>
            </div>
          ) : (
            <p className="text-theme-sm text-gray-500 dark:text-gray-400">
              {t("promotions.none")}
            </p>
          )}
        </div>

        {/* Активация */}
        <div className="rounded-xl border border-gray-100 p-4 dark:border-gray-800">
          <h3 className="mb-2 text-theme-xs font-semibold uppercase tracking-wide text-gray-400">
            {active
              ? t("promotions.replaceHeading")
              : t("promotions.activateHeading")}
          </h3>
          <div className="space-y-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                {t("promotions.tier")}
              </span>
              <select
                value={activateType}
                onChange={(e) =>
                  setActivateType(e.target.value as ActivatablePromotionType)
                }
                disabled={busy}
                className="rounded-lg border border-gray-300 bg-transparent px-3 py-2 text-theme-sm text-gray-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 disabled:opacity-50 dark:border-gray-700 dark:text-white"
              >
                {ACTIVATABLE_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {enums.promotionType[type]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                {t("promotions.period")}
              </span>
              <select
                value={activatePeriod}
                onChange={(e) =>
                  setActivatePeriod(
                    Number(e.target.value) as PromotionPeriodDays,
                  )
                }
                disabled={busy}
                className="rounded-lg border border-gray-300 bg-transparent px-3 py-2 text-theme-sm text-gray-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 disabled:opacity-50 dark:border-gray-700 dark:text-white"
              >
                {PROMOTION_PERIODS.map((days) => (
                  <option key={days} value={days}>
                    {periodLabel(days, locale)}
                  </option>
                ))}
              </select>
            </label>
            {priceLabel && (
              <p className="text-theme-xs text-gray-500 dark:text-gray-400">
                {t("promotions.cost", { price: priceLabel })}
              </p>
            )}
            {active && (
              <p className="text-theme-xs text-warning-600 dark:text-warning-500">
                {t("promotions.replaceWarning")}
              </p>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={handleActivate}
              className="w-full rounded-lg bg-brand-500 px-4 py-2.5 text-theme-sm font-medium text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-brand-500/40"
            >
              {activation.isLoading
                ? t("promotions.activating")
                : t("promotions.activate")}
            </button>
          </div>
        </div>
      </div>

      {/* История */}
      <div className="mt-6 space-y-3">
        <h3 className="text-theme-xs font-semibold uppercase tracking-wide text-gray-400">
          {t("promotions.historyTitle")}
        </h3>
        <DataTable
          columns={historyColumns}
          rows={historyQuery.data}
          getRowKey={(row) => row.id}
          isLoading={historyQuery.isLoading}
          isError={historyQuery.isError}
          errorMessage={t("promotions.historyError")}
          onRetry={historyQuery.refetch}
          emptyMessage={t("promotions.historyEmpty")}
          skeletonRows={3}
        />
      </div>

      {/* Диалог отмены */}
      {cancelOpen && active && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !busy && setCancelOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-theme-lg dark:border-gray-800 dark:bg-gray-900"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-theme-lg font-semibold text-gray-900 dark:text-white">
              {t("promotions.cancelTitle")}
            </h3>
            <p className="mt-1 text-theme-sm text-gray-500 dark:text-gray-400">
              {t("promotions.cancelDescription", {
                type: enums.promotionType[active.type],
              })}
            </p>
            <label className="mt-4 flex flex-col gap-1.5">
              <span className="text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                {t("promotions.cancelReasonLabel")}
              </span>
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder={t("promotions.cancelReasonPlaceholder")}
                className="rounded-lg border border-gray-300 bg-transparent px-3 py-2 text-theme-sm text-gray-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-gray-700 dark:text-white"
              />
            </label>
            <div className="mt-5 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setCancelOpen(false)}
                disabled={cancellation.isLoading}
                className="rounded-lg border border-gray-300 px-4 py-2 text-theme-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-40 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.03]"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                onClick={handleCancel}
                disabled={cancellation.isLoading}
                className="rounded-lg bg-error-500 px-4 py-2 text-theme-sm font-medium text-white transition hover:bg-error-600 disabled:cursor-not-allowed disabled:bg-error-500/40"
              >
                {cancellation.isLoading
                  ? t("promotions.cancelling")
                  : t("promotions.cancelConfirm")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Диалог продления */}
      {extendOpen && active && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !busy && setExtendOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-theme-lg dark:border-gray-800 dark:bg-gray-900"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-theme-lg font-semibold text-gray-900 dark:text-white">
              {t("promotions.extendTitle")}
            </h3>
            <p className="mt-1 text-theme-sm text-gray-500 dark:text-gray-400">
              {t("promotions.extendCurrentExpiry", {
                date: formatDateTime(active.expires_at, locale),
              })}
            </p>
            <label className="mt-4 flex flex-col gap-1.5">
              <span className="text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                {t("promotions.extendPeriodLabel")}
              </span>
              <select
                value={extendPeriod}
                onChange={(e) =>
                  setExtendPeriod(Number(e.target.value) as PromotionPeriodDays)
                }
                className="rounded-lg border border-gray-300 bg-transparent px-3 py-2 text-theme-sm text-gray-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-gray-700 dark:text-white"
              >
                {PROMOTION_PERIODS.map((days) => (
                  <option key={days} value={days}>
                    {periodLabel(days, locale)}
                  </option>
                ))}
              </select>
            </label>
            <div className="mt-5 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setExtendOpen(false)}
                disabled={extension.isLoading}
                className="rounded-lg border border-gray-300 px-4 py-2 text-theme-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-40 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.03]"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                onClick={handleExtend}
                disabled={extension.isLoading}
                className="rounded-lg bg-brand-500 px-4 py-2 text-theme-sm font-medium text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-brand-500/40"
              >
                {extension.isLoading
                  ? t("promotions.extending")
                  : t("promotions.extend")}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
