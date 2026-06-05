import { ThemeProvider } from "@/context/ThemeContext";
import { SidebarProvider } from "@/context/SidebarContext";
import { AdminShell } from "@/layout/AdminShell";

// Route group `(admin)` keeps the admin shell separate from the public site.
// Providers wrap the shell so AppSidebar/AppHeader can consume the contexts.
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ThemeProvider>
      <SidebarProvider>
        <AdminShell>{children}</AdminShell>
      </SidebarProvider>
    </ThemeProvider>
  );
}
