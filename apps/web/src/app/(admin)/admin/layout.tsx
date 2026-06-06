import { ThemeProvider } from "@/context/ThemeContext";
import { SidebarProvider } from "@/context/SidebarContext";
import { ToastProvider } from "@/components/admin/toast/ToastProvider";
import { ConditionalShell } from "@/layout/ConditionalShell";

// Route group `(admin)` keeps the admin shell separate from the public site.
// Providers wrap the content so AppSidebar/AppHeader can consume the contexts;
// ToastProvider mounts the shared toast viewport (ADMIN-16) above the shell and
// dialogs; ConditionalShell renders the full-screen login (/admin/login) without
// chrome.
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ThemeProvider>
      <SidebarProvider>
        <ToastProvider>
          <ConditionalShell>{children}</ConditionalShell>
        </ToastProvider>
      </SidebarProvider>
    </ThemeProvider>
  );
}
