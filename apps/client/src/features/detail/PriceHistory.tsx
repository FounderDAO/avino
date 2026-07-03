/**
 * PriceHistory — публичный блок «История цены» на detail (ADR-0121, Zillow-style).
 * Клиентский компонент (usePriceFormatter → цена следует за тогглом [сум|$]).
 * Записи приходят от старых к новым; показываем новые сверху. Дельта — % к
 * предыдущей записи; между разными валютами не считается.
 */
'use client';

import { useLocale, useTranslations } from 'next-intl';
import { TrendingDown, TrendingUp } from 'lucide-react';
import type { Listing, PriceHistoryEntry } from '@/lib/mock/types';
import { usePriceFormatter } from '@/lib/usePriceFormatter';

export interface PriceHistoryProps {
  listing: Pick<Listing, 'tx' | 'priceHistory'>;
}

/** % к предыдущей записи; null — сравнить нельзя (нет prev / другая валюта / шум <0.05%). */
function deltaPct(
  prev: PriceHistoryEntry | undefined,
  cur: PriceHistoryEntry,
): number | null {
  if (!prev || prev.currency !== cur.currency) return null;
  const a = Number(prev.price);
  const b = Number(cur.price);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0) return null;
  const pct = ((b - a) / a) * 100;
  return Math.abs(pct) < 0.05 ? null : pct;
}

const DATE_LOCALES: Record<string, string> = { uz: 'uz-UZ', en: 'en-US', ru: 'ru-RU' };

export function PriceHistory({ listing }: PriceHistoryProps) {
  const t = useTranslations('listing');
  const locale = useLocale();
  const fmt = usePriceFormatter();
  const entries = listing.priceHistory ?? [];
  if (entries.length === 0) return null;

  const dateFmt = new Intl.DateTimeFormat(DATE_LOCALES[locale] ?? 'ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  // Новые сверху; label: первая (хронологически) запись — «Опубликовано».
  const rows = entries
    .map((entry, i) => ({ entry, isFirst: i === 0, pct: deltaPct(entries[i - 1], entry) }))
    .reverse();

  return (
    <div className="mt-7">
      <h2 className="text-[22px]">{t('priceHistory.title')}</h2>
      <div className="mt-3 overflow-hidden rounded-feature border border-border">
        <table className="w-full text-sm">
          <tbody>
            {rows.map(({ entry, isFirst, pct }) => (
              <tr
                key={entry.createdAt}
                className="border-b border-border last:border-b-0"
              >
                <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                  {dateFmt.format(new Date(entry.createdAt))}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {isFirst ? t('priceHistory.listed') : t('priceHistory.changed')}
                </td>
                <td className="px-4 py-3 text-right font-bold whitespace-nowrap">
                  {fmt.price({ price: entry.price, currency: entry.currency, tx: listing.tx })}
                </td>
                <td className="px-4 py-3 w-24 text-right whitespace-nowrap">
                  {pct != null && (
                    <span
                      className={`inline-flex items-center gap-1 text-[13px] font-semibold ${
                        pct < 0 ? 'text-green' : 'text-red-500'
                      }`}
                    >
                      {pct < 0 ? <TrendingDown size={14} /> : <TrendingUp size={14} />}
                      {pct > 0 ? '+' : '−'}
                      {Math.abs(pct).toFixed(1)} %
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
