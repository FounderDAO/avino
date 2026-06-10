import { StoreProvider } from '@/store/StoreProvider';
import { ToastProvider } from '@/components/admin/toast';
import { ConditionalShell } from '@/components/admin/ConditionalShell';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <StoreProvider>
      <ToastProvider>
        <ConditionalShell>{children}</ConditionalShell>
      </ToastProvider>
    </StoreProvider>
  );
}
