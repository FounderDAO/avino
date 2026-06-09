'use client';

import { usePathname } from 'next/navigation';
import { AdminShell } from './AdminShell';
import { RoleGuard } from './RoleGuard';

/**
 * ConditionalShell — /admin/login рендерится полноэкранно (без sidebar/header)
 * и вне guard'а (иначе редирект-петля). Остальные маршруты — под RoleGuard +
 * AdminShell.
 */
const CHROMELESS_ROUTES = ['/admin/login'];

export function ConditionalShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (CHROMELESS_ROUTES.includes(pathname)) return <>{children}</>;
  return (
    <RoleGuard>
      <AdminShell>{children}</AdminShell>
    </RoleGuard>
  );
}
