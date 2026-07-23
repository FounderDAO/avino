/**
 * AmenityChips — чипы удобств detail-страницы (ADR-0111, Zillow Phase 2;
 * Task 5: динамический справочник GET /amenities).
 *
 * Серверный компонент: справочник фетчит Detail (`lib/api/amenities.ts`) и
 * отдаёт готовым пропом, поэтому чипы попадают в SSR-HTML (контентный сигнал
 * для поисковиков, нет мигания пустой секции до гидратации). Коды, которых нет
 * в активном справочнике (скрытые админом), не рендерятся.
 */
import {
  ArrowUpDown,
  Building2,
  Check,
  Flame,
  ShieldCheck,
  Snowflake,
  Sofa,
  SquareParking,
  WashingMachine,
  Waves,
  Wifi,
  type LucideIcon,
} from 'lucide-react';
import { amenityLabel, type AmenityOption } from '@/lib/amenities';
import type { ParkingType } from '@/lib/mock/types';

/** Иконки для известных кодов удобств; новые коды из справочника — Check. */
const AMENITY_ICON: Record<string, LucideIcon> = {
  AIR_CONDITIONING: Snowflake,
  FURNITURE: Sofa,
  APPLIANCES: WashingMachine,
  INTERNET: Wifi,
  ELEVATOR: ArrowUpDown,
  BALCONY: Building2,
  HEATING: Flame,
  SECURITY: ShieldCheck,
  POOL: Waves,
};

const CHIP_CLASS =
  'inline-flex items-center gap-1.5 rounded-pill border border-border bg-surface px-3.5 py-2 text-sm font-semibold';

export interface AmenityChipsProps {
  /** Коды удобств объявления. */
  codes: string[];
  /** Активный справочник удобств (SSR-фетч в Detail). */
  options: AmenityOption[];
  /** Локаль интерфейса для выбора лейбла. */
  locale: string;
  parkingType?: ParkingType;
  /** Лейбл типа парковки (уже переведён в Detail.tsx — parking остаётся статичным enum). */
  parkingLabel?: string;
}

export function AmenityChips({
  codes,
  options,
  locale,
  parkingType,
  parkingLabel,
}: AmenityChipsProps) {
  const byCode = new Map(options.map((a) => [a.code, a]));

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {codes.map((code) => {
        const opt = byCode.get(code);
        if (!opt) return null;
        const Icon = AMENITY_ICON[code] ?? Check;
        return (
          <span key={code} className={CHIP_CLASS}>
            <Icon size={15} strokeWidth={2} className="text-teal" />
            {amenityLabel(opt, locale)}
          </span>
        );
      })}
      {parkingType && parkingLabel && (
        <span key="parking" className={CHIP_CLASS}>
          <SquareParking size={15} strokeWidth={2} className="text-teal" />
          {parkingLabel}
        </span>
      )}
    </div>
  );
}
