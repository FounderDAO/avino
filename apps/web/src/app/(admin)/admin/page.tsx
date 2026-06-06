import type { Metadata } from "next";

import { DashboardOverview } from "@/components/admin/DashboardOverview";

export const metadata: Metadata = {
  title: "Avino — админка",
  description: "Панель администратора Avino",
};

// ADMIN-15 — дашборд с живыми счётчиками (GET /admin/stats). Серверная обёртка
// держит metadata; заголовок, подпись и счётчики рендерит клиентский
// DashboardOverview (RTK Query + i18n, ADMIN-17).
export default function AdminDashboardPage() {
  return <DashboardOverview />;
}
