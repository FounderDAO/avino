import type { Metadata } from "next";

import { DashboardOverview } from "@/components/admin/DashboardOverview";

export const metadata: Metadata = {
  title: "Avino — админка",
  description: "Панель администратора Avino",
};

// ADMIN-15 — дашборд с живыми счётчиками (GET /admin/stats). Серверная обёртка
// держит metadata; сами счётчики тянет клиентский DashboardOverview (RTK Query).
export default function AdminDashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-title-sm font-bold text-gray-900 dark:text-white">
          Дашборд
        </h1>
        <p className="mt-1 text-theme-sm text-gray-500 dark:text-gray-400">
          Сводка по разделам админки. Нажмите на карточку, чтобы перейти в раздел.
        </p>
      </div>

      <DashboardOverview />
    </div>
  );
}
