"use client";

import Link from "next/link";

import { useGetAdminStatsQuery } from "@/store/api/adminStatsApi";
import type { AdminStats } from "@/store/api/adminTypes";
import { getApiError } from "@/store/api/apiError";

/**
 * DashboardOverview (ADMIN-15) — живые счётчики дашборда из `GET /admin/stats`.
 *
 * Один запрос отдаёт четыре числа; карточки кликабельны и ведут в
 * соответствующие разделы (листинги/жалобы/пользователи). «Активные промо» —
 * без своей страницы-списка (промо управляются из карточки листинга), поэтому
 * это карточка без ссылки. Состояния loading/error решаются здесь точечно;
 * единый UX состояний по всей админке появится в ADMIN-16.
 */
type StatCard = {
  key: keyof AdminStats;
  label: string;
  hint: string;
  href?: string;
};

const CARDS: StatCard[] = [
  {
    key: "listings_new",
    label: "Объявления на модерации",
    hint: "NEW",
    href: "/admin/listings",
  },
  {
    key: "complaints_new",
    label: "Новые жалобы",
    hint: "NEW",
    href: "/admin/complaints",
  },
  {
    key: "users_total",
    label: "Пользователи",
    hint: "всего",
    href: "/admin/users",
  },
  {
    key: "promotions_active",
    label: "Активные промо",
    hint: "VIP / TOP",
  },
];

function formatValue(
  value: number | undefined,
  isLoading: boolean,
  isError: boolean,
): string {
  if (isError) return "—";
  if (isLoading || value === undefined) return "…";
  return new Intl.NumberFormat("ru-RU").format(value);
}

export function DashboardOverview() {
  const { data, isLoading, isError, error } = useGetAdminStatsQuery();
  const apiError = isError ? getApiError(error) : null;

  return (
    <div className="space-y-4">
      {apiError ? (
        <div
          role="alert"
          className="rounded-xl border border-error/30 bg-error/5 px-4 py-3 text-theme-sm text-error"
        >
          Не удалось загрузить счётчики: {apiError.message}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {CARDS.map((card) => {
          const value = formatValue(data?.[card.key], isLoading, isError);
          const body = (
            <>
              <p className="text-theme-sm text-gray-500 dark:text-gray-400">
                {card.label}
              </p>
              <div className="mt-3 flex items-end justify-between">
                <span className="text-title-sm font-bold text-gray-800 dark:text-white/90">
                  {value}
                </span>
                <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-theme-xs font-medium text-brand-500 dark:bg-brand-500/[0.12] dark:text-brand-400">
                  {card.hint}
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
