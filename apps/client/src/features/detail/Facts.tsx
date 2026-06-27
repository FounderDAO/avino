/**
 * Facts — сетка ключевых характеристик объекта (комнаты/площадь/этаж/год).
 * Перенос блока facts-grid + Fact из claudeDesign/detail.jsx на токены проекта.
 */
import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Bed, Bath, Ruler, Layers, CalendarDays, SquareParking, Trees, type LucideIcon } from 'lucide-react';
import { formatArea } from '@/lib/format';
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
  // Собираем только заполненные характеристики (у участка/коммерции часть пуста).
  const items: React.ReactNode[] = [];
  if (listing.rooms) {
    items.push(<Fact key="rooms" icon={Bed} label={tUnits('roomsLabel', { count: listing.rooms })} value={listing.rooms} />);
  }
  if (listing.bathrooms) {
    items.push(<Fact key="bathrooms" icon={Bath} label={tUnits('bathroomsLabel', { count: listing.bathrooms })} value={listing.bathrooms} />);
  }
  if (listing.area) {
    items.push(<Fact key="area" icon={Ruler} label={t('facts.area')} value={formatArea(listing.area, tUnits)} />);
  }
  if (listing.floor && listing.totalFloors) {
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
  if (listing.parkingType) {
    items.push(<Fact key="parking" icon={SquareParking} label={t('facts.parking')} value={tEnums(`parking.${listing.parkingType}`)} />);
  }
  if (listing.lotArea) {
    items.push(<Fact key="lotArea" icon={Trees} label={t('facts.lotArea')} value={tUnits('lotArea', { value: listing.lotArea })} />);
  }

  if (items.length === 0) return null;

  return (
    <div className={'grid grid-cols-2 gap-3 sm:grid-cols-3 ' + (className ?? '')}>{items}</div>
  );
}
