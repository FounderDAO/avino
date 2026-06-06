"use client";

import Link from "next/link";

import { useGetAdminStatsQuery } from "@/store/api/adminStatsApi";
import type { AdminStats } from "@/store/api/adminTypes";
import { getApiError } from "@/store/api/apiError";
import { InlineAlert } from "@/components/admin/states";
import { LOCALE_META, useT } from "@/lib/i18n";

/**
 * DashboardOverview (ADMIN-15) — живые счётчики дашборда из `GET /admin/stats`.
 *
 * Один запрос отдаёт четыре числа; карточки кликабельны и ведут в
 * соответствующие разделы (листинги/жалобы/пользователи). «Активные промо» —
 * без своей страницы-списка (промо управляются из карточки листинга), поэтому
 * это карточка без ссылки. Состояние ошибки — единый `InlineAlert` (ADMIN-16).
 */
type StatCard = {
  key: keyof AdminStats;
  labelKey: string;
  hint: string;
  href?: string;
};

const CARDS: StatCard[] = [
  {
    key: "listings_new",
    labelKey: "dashboard.listingsNew",
    hint: "NEW",
    href: "/admin/listings",
  },
  {
    key: "complaints_new",
    labelKey: "dashboard.complaintsNew",
    hint: "NEW",
    href: "/admin/complaints",
  },
  {
    key: "users_total",
    labelKey: "dashboard.usersTotal",
    hint: "total",
    href: "/admin/users",
  },
  {
    key: "promotions_active",
    labelKey: "dashboard.promotionsActive",
    hint: "VIP / TOP",
  },
];

function formatValue(
  value: number | undefined,
  isLoading: boolean,
  isError: boolean,
  bcp47: string,
): string {
  if (isError) return "—";
  if (isLoading || value === undefined) return "…";
  return new Intl.NumberFormat(bcp47).format(value);
}

export function DashboardOverview() {
  const { t, locale } = useT();
  const { data, isLoading, isError, error } = useGetAdminStatsQuery();
  const apiError = isError ? getApiError(error) : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-title-sm font-bold text-gray-900 dark:text-white">
          {t("dashboard.title")}
        </h1>
        <p className="mt-1 text-theme-sm text-gray-500 dark:text-gray-400">
          {t("dashboard.subtitle")}
        </p>
      </div>

      {apiError ? (
        <InlineAlert>
          {t("dashboard.loadError", { message: apiError.message })}
        </InlineAlert>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {CARDS.map((card) => {
          const value = formatValue(
            data?.[card.key],
            isLoading,
            isError,
            LOCALE_META[locale].bcp47,
          );
          const hint =
            card.hint === "total" ? t("dashboard.hintTotal") : card.hint;
          const body = (
            <>
              <p className="text-theme-sm text-gray-500 dark:text-gray-400">
                {t(card.labelKey)}
              </p>
              <div className="mt-3 flex items-end justify-between">
                <span className="text-title-sm font-bold text-gray-800 dark:text-white/90">
                  {value}
                </span>
                <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-theme-xs font-medium text-brand-500 dark:bg-brand-500/[0.12] dark:text-brand-400">
                  {hint}
                </span>
              </div>
            </>
          );

          const className =
            "block rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]";

          return card.href ? (
            <Link
              key={card.key}
              href={card.href}
              className={`${className} transition-colors hover:border-brand-300 dark:hover:border-brand-500/50`}
            >
              {body}
            </Link>
          ) : (
            <div key={card.key} className={className}>
              {body}
            </div>
          );
        })}
      </div>
    </div>
  );
}
