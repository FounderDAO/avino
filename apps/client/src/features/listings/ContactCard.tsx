import Link from 'next/link';
import { BadgeCheck, CalendarClock, MessageSquare } from 'lucide-react';
import { DealType } from '@avino/shared';
import { Button } from '@/components/ui/button';
import type { ListingDetail } from '@/store/api/listingsApi';
import { estimateMortgage } from './format';

/**
 * Sticky-карточка контакта (TASK-153, дизайн-спек §4.3).
 *
 * «Записаться на просмотр» и «Написать» требуют авторизации (TASK-150) —
 * до её появления ведут на `/login` (критерий «chat CTA exists for
 * authenticated users»). Для сделок продажи показываем mint-чип с грубой
 * оценкой ипотеки (placeholder, реальный калькулятор позже).
 */
export function ContactCard({ listing }: { listing: ListingDetail }) {
  const mortgage =
    listing.transaction_type === DealType.SALE
      ? estimateMortgage(listing.price, listing.currency)
      : null;

  return (
    <aside className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-[0_4px_18px_-6px_rgba(40,34,24,0.14)] lg:sticky lg:top-20">
      <div className="flex items-center gap-2">
        <span className="text-base font-bold text-foreground">Avino</span>
        <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-xs font-bold text-accent-foreground">
          <BadgeCheck className="size-3.5" />
          Avino Pro
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <Button asChild size="lg" className="rounded-full">
          <Link href="/login">
            <CalendarClock className="size-5" />
            Записаться на просмотр
          </Link>
        </Button>
        <Button asChild variant="outline" size="lg" className="rounded-full">
          <Link href="/login">
            <MessageSquare className="size-5" />
            Написать
          </Link>
        </Button>
      </div>

      {mortgage && (
        <p className="rounded-xl bg-accent px-3 py-2 text-sm text-accent-foreground">
          Ипотека: <span className="font-bold">примерно {mortgage}/мес</span>
        </p>
      )}
    </aside>
  );
}
