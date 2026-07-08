/**
 * Facts — сетка ключевых характеристик объекта: тип / площадь / этаж / год /
 * цена за м² (+ участок для дома/земли).
 *
 * Комнаты и санузлы показываются строкой характеристик выше (specs), парковка
 * вынесена в раздел «Удобства» (Detail.tsx) — здесь их нет. Цена за м² следует
 * за переключателем валют [сум|$] через usePriceFormatter, поэтому компонент
 * клиентский (как DetailPrice).
 */
'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Building2, Ruler, Layers, CalendarDays, Coins, Trees, type LucideIcon } from 'lucide-react';
import { formatArea, propertyTypeLabel } from '@/lib/format';
import { usePriceFormatter } from '@/lib/usePriceFormatter';
import type { Listing } from '@/lib/mock/types';

/** Одна карточка характеристики: иконка + значение + лейбл. */
function Fact({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-card border border-border bg-surface-2 px-4 py-3.5">
      <span className="shrink-0 text-teal">
        <Icon size={22} strokeWidth={1.8} />
      </span>
      <div className="min-w-0">
        <div className="text-[17px] font-extrabold leading-tight">{value}</div>
        <div className="mt-0.5 text-[12.5px] text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

export interface FactsProps {
  listing: Listing;
  className?: string;
}

export function Facts({ listing, className }: FactsProps) {
  const t = useTranslations('listing');
  const tUnits = useTranslations('units');
  const tEnums = useTranslations('enums');
  const fmt = usePriceFormatter();
  const items: React.ReactNode[] = [];

  // Тип недвижимости (есть всегда).
  items.push(
    <Fact key="type" icon={Building2} label={t('facts.propertyType')} value={propertyTypeLabel(listing.type, tEnums)} />,
  );

  if (listing.area) {
    items.push(<Fact key="area" icon={Ruler} label={t('facts.area')} value={formatArea(listing.area, tUnits)} />);
  }
  if (listing.isBasement) {
    // Цокольный этаж (LAST_CHANGED_API.md §1): floor при этом null, показываем «Цоколь».
    items.push(<Fact key="floor" icon={Layers} label={t('facts.floor')} value={t('facts.basementValue')} />);
  } else if (listing.floor && listing.totalFloors) {
    items.push(
      <Fact
        key="floor"
        icon={Layers}
        label={t('facts.floor')}
        value={t('facts.floorOf', { floor: listing.floor, total: listing.totalFloors })}
      />,
    );
  }
  if (listing.year) {
    items.push(<Fact key="year" icon={CalendarDays} label={t('facts.year')} value={listing.year} />);
  }

  // Цена за м²: у частного дома считаем от жилой площади (фолбэк — общая),
  // у остального — от общей площади. Значение конвертируется под валюту показа.
  const areaBasis =
    listing.type === 'HOUSE' && listing.livingArea && Number(listing.livingArea) > 0
      ? Number(listing.livingArea)
      : listing.area
        ? Number(listing.area)
        : 0;
  const priceNum = Number(listing.price);
  if (areaBasis > 0 && priceNum > 0) {
    const value = fmt.price(
      { price: String(Math.round(priceNum / areaBasis)), currency: listing.currency, tx: listing.tx },
      { suffix: false },
    );
    items.push(<Fact key="ppsm" icon={Coins} label={t('facts.pricePerSqm')} value={value} />);
  }

  if (listing.lotArea) {
    items.push(<Fact key="lotArea" icon={Trees} label={t('facts.lotArea')} value={tUnits('lotArea', { value: listing.lotArea })} />);
  }

  if (items.length === 0) return null;

  return (
    <div className={'grid grid-cols-2 gap-3 sm:grid-cols-3 ' + (className ?? '')}>{items}</div>
  );
}
