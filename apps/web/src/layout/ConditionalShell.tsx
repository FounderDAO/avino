"use client";

import { usePathname } from "next/navigation";
import { AdminShell } from "@/layout/AdminShell";

/**
 * ConditionalShell — внутри route group `(admin)` лежит и логин (`/admin/login`),
 * и сами разделы панели. Логин должен быть полноэкранным (без sidebar/header),
 * поэтому здесь решаем, оборачивать ли содержимое в TailAdmin-оболочку.
 *
 * Гард роли ADMIN (редирект на /admin/login, экран 403) добавляется поверх в
 * ADMIN-06 — этот компонент — точка, где он будет жить.
 */

/** Маршруты, рендерящиеся без админ-оболочки (полноэкранные). */
const CHROMELESS_ROUTES = ["/admin/login"];

export function ConditionalShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (CHROMELESS_ROUTES.includes(pathname)) {
    return <>{children}</>;
  }

  return <AdminShell>{children}</AdminShell>;
}
