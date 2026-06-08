import Link from 'next/link';
import { Home } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Бренд-лого Avino. Текстовый логотип с иконкой-домом в бренд-красном
 * (ADR-0060). Заменяется на SVG-лого, когда появится финальный бренд-ассет.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      aria-label="Avino — на главную"
      className={cn(
        'inline-flex items-center gap-1.5 text-xl font-bold tracking-tight text-primary',
        className,
      )}
    >
      <Home className="size-6" strokeWidth={2.5} />
      <span>Avino</span>
    </Link>
  );
}
