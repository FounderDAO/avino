import { ThemeProvider } from "@/context/ThemeContext";
import { SidebarProvider } from "@/context/SidebarContext";
import { ConditionalShell } from "@/layout/ConditionalShell";

// Route group `(admin)` keeps the admin shell separate from the public site.
// Providers wrap the content so AppSidebar/AppHeader can consume the contexts;
// ConditionalShell renders the full-screen login (/admin/login) without chrome.
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ThemeProvider>
      <SidebarProvider>
        <ConditionalShell>{children}</ConditionalShell>
      </SidebarProvider>
    </ThemeProvider>
  );
}
