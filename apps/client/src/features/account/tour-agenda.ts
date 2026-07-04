import type { TourRequestItem } from '@/store/api/tourRequestsApi';

/** Роль текущего пользователя в туре: host — принимает (incoming), guest — идёт (outgoing). */
export type TourRole = 'host' | 'guest';

export interface AgendaEntry {
  item: TourRequestItem;
  role: TourRole;
}

/** Единая агенда предстоящих туров обеих ролей: по дате, затем по началу окна. */
export function mergeUpcoming(
  incoming: TourRequestItem[] | undefined,
  outgoing: TourRequestItem[] | undefined,
): AgendaEntry[] {
  const entries: AgendaEntry[] = [
    ...(incoming ?? []).map((item) => ({ item, role: 'host' as const })),
    ...(outgoing ?? []).map((item) => ({ item, role: 'guest' as const })),
  ];
  return entries.sort(
    (a, b) =>
      a.item.requested_date.localeCompare(b.item.requested_date) ||
      a.item.window_start.localeCompare(b.item.window_start),
  );
}
