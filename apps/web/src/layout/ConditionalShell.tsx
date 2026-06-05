"use client";

import { usePathname } from "next/navigation";
import { AdminShell } from "@/layout/AdminShell";
import { RoleGuard } from "@/layout/RoleGuard";

/**
 * ConditionalShell — внутри route group `(admin)` лежит и логин (`/admin/login`),
 * и сами разделы панели. Логин должен быть полноэкранным (без sidebar/header),
 * поэтому здесь решаем, оборачивать ли содержимое в TailAdmin-оболочку.
 *
 * Гард роли ADMIN (ADMIN-06) вешается только на защищённые маршруты — логин
 * остаётся вне гарда, иначе редирект на `/admin/login` зациклился бы.
 */

/** Маршруты, рендерящиеся без админ-оболочки (полноэкранные) и без гарда. */
const CHROMELESS_ROUTES = ["/admin/login"];

export function ConditionalShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (CHROMELESS_ROUTES.includes(pathname)) {
    return <>{children}</>;
  }

  return (
    <RoleGuard>
      <AdminShell>{children}</AdminShell>
    </RoleGuard>
  );
}
