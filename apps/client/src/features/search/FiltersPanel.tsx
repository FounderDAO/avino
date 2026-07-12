/**
 * FiltersPanel — мега-панель «Фильтры» (Zillow «More»).
 *
 * Layout-агностична: не оборачивает в Dropdown/Sheet — это делает Task 8.
 * Хранит локальный draft-стейт; коммит по «Применить», сброс по «Сбросить всё».
 */
'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { RangeFields } from './controls/RangeFields';
import { BedroomsControl } from './controls/BedroomsControl';
import { BathroomsControl } from './controls/BathroomsControl';
import { ParkingMultiSelect } from './controls/ParkingMultiSelect';
import { AmenitiesMultiSelect } from './controls/AmenitiesMultiSelect';
import type { Amenity, ParkingType } from '@/lib/mock/types';

// ─── Публичные типы (потребляет Task 8) ──────────────────────────────────────

export interface FiltersPanelValues {
  roomsMin?: number;
  bathroomsMin?: number;
  areaMin?: string;
  areaMax?: string;
  lotAreaMin?: string;
  lotAreaMax?: string;
  yearMin?: string;
  yearMax?: string;
  /** «Новостройка» — год постройки за последние 3 года или в будущем (недострой). */
  newConstruction?: boolean;
  floorMin?: string;
  floorMax?: string;
  notFirstFloor?: boolean;
  notLastFloor?: boolean;
  totalFloorsMin?: string;
  totalFloorsMax?: string;
  listingSource?: ('OWNER' | 'AGENCY')[];
  toursEnabled?: boolean;
  parkingTypes?: ParkingType[];
  amenities?: Amenity[];
  /** Только цокольные этажи (`?is_basement=true`, LAST_CHANGED_API.md §1). */
  isBasement?: boolean;
}

export interface FiltersPanelProps {
  values: FiltersPanelValues;
  onApply: (next: FiltersPanelValues) => void;
  onReset: () => void;
}

// ─── Утилита: пустой draft ────────────────────────────────────────────────────

function emptyDraft(): FiltersPanelValues {
  return {};
}

// ─── Компонент ───────────────────────────────────────────────────────────────

export function FiltersPanel({ values, onApply, onReset }: FiltersPanelProps) {
  const t = useTranslations('search.filters');

  // Локальный draft-стейт; ресинкится при изменении внешних values.
  const [draft, setDraft] = React.useState<FiltersPanelValues>(() => ({ ...values }));
  React.useEffect(() => {
    setDraft({ ...values });
  }, [values]);

  // ── Хелпер точечного обновления draft ──
  const patch = React.useCallback((delta: Partial<FiltersPanelValues>) => {
    setDraft((prev) => ({ ...prev, ...delta }));
  }, []);

  // ── Обработчик мультивыбора listingSource (оба → без фильтра) ──
  const toggleSource = React.useCallback((src: 'OWNER' | 'AGENCY') => {
    setDraft((prev) => {
      const cur = prev.listingSource ?? [];
      const next = cur.includes(src)
        ? cur.filter((s) => s !== src)
        : [...cur, src];
      return { ...prev, listingSource: next.length ? next : undefined };
    });
  }, []);

  // ── Сбросить всё ──
  const handleReset = React.useCallback(() => {
    setDraft(emptyDraft());
    onReset();
  }, [onReset]);

  return (
    <div className="flex max-h-[72vh] flex-col">
      {/* Прокручиваемое тело: скроллится только контент, футер закреплён снизу */}
      <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-4">

      {/* 0. Комнаты и санузлы */}
      <Section title={t('roomsAndBathrooms')}>
        <BedroomsControl
          value={draft.roomsMin}
          exact={false}
          showExact={false}
          onChange={({ value }) => patch({ roomsMin: value })}
        />
        <div className="mt-2 text-[12.5px] font-bold text-muted-foreground">{t('bathrooms')}</div>
        <BathroomsControl
          value={draft.bathroomsMin}
          onChange={(value) => patch({ bathroomsMin: value })}
        />
      </Section>

      {/* 1. Площадь, м² */}
      <Section title={t('areaTitle')}>
        <RangeFields
          min={draft.areaMin ?? ''}
          max={draft.areaMax ?? ''}
          onMin={(v) => patch({ areaMin: v || undefined })}
          onMax={(v) => patch({ areaMax: v || undefined })}
          fromLabel={t('rangeFrom')}
          toLabel={t('rangeTo')}
          suffix="м²"
        />
      </Section>

      {/* 1b. Площадь участка, соток */}
      <Section title={t('lotAreaTitle')}>
        <RangeFields
          min={draft.lotAreaMin ?? ''}
          max={draft.lotAreaMax ?? ''}
          onMin={(v) => patch({ lotAreaMin: v || undefined })}
          onMax={(v) => patch({ lotAreaMax: v || undefined })}
          fromLabel={t('rangeFrom')}
          toLabel={t('rangeTo')}
          suffix="соток"
        />
      </Section>

      {/* 2. Год постройки */}
      <Section title={t('yearTitle')}>
        <RangeFields
          min={draft.yearMin ?? ''}
          max={draft.yearMax ?? ''}
          onMin={(v) => patch({ yearMin: v || undefined })}
          onMax={(v) => patch({ yearMax: v || undefined })}
          fromLabel={t('rangeFrom')}
          toLabel={t('rangeTo')}
        />
        <div className="mt-2">
          <CheckboxRow
            label={t('newConstruction')}
            checked={draft.newConstruction ?? false}
            onChange={(checked) => patch({ newConstruction: checked || undefined })}
          />
          <p className="mt-1 pl-6 text-[12px] text-muted-foreground">{t('newConstructionHint')}</p>
        </div>
      </Section>

      {/* 3. Этаж + чекбоксы */}
      <Section title={t('floorTitle')}>
        <RangeFields
          min={draft.floorMin ?? ''}
          max={draft.floorMax ?? ''}
          onMin={(v) => patch({ floorMin: v || undefined })}
          onMax={(v) => patch({ floorMax: v || undefined })}
          fromLabel={t('rangeFrom')}
          toLabel={t('rangeTo')}
        />
        <div className="mt-2 flex flex-col gap-1.5">
          <CheckboxRow
            label={t('notFirstFloor')}
            checked={draft.notFirstFloor ?? false}
            onChange={(checked) => patch({ notFirstFloor: checked || undefined })}
          />
          <CheckboxRow
            label={t('notLastFloor')}
            checked={draft.notLastFloor ?? false}
            onChange={(checked) => patch({ notLastFloor: checked || undefined })}
          />
        </div>
      </Section>

      {/* 4. Этажность дома */}
      <Section title={t('totalFloorsTitle')}>
        <RangeFields
          min={draft.totalFloorsMin ?? ''}
          max={draft.totalFloorsMax ?? ''}
          onMin={(v) => patch({ totalFloorsMin: v || undefined })}
          onMax={(v) => patch({ totalFloorsMax: v || undefined })}
          fromLabel={t('rangeFrom')}
          toLabel={t('rangeTo')}
        />
      </Section>

      {/* 5. Тип объявления — мультивыбор (можно оба) */}
      <Section title={t('listingSourceTitle')}>
        <div className="flex flex-col gap-1.5">
          <CheckboxRow
            label={t('sourceOwner')}
            checked={draft.listingSource?.includes('OWNER') ?? false}
            onChange={() => toggleSource('OWNER')}
          />
          <CheckboxRow
            label={t('sourceAgency')}
            checked={draft.listingSource?.includes('AGENCY') ?? false}
            onChange={() => toggleSource('AGENCY')}
          />
        </div>
      </Section>

      {/* 6. Парковка */}
      <Section title={t('parkingTypesTitle')}>
        <ParkingMultiSelect
          value={draft.parkingTypes ?? []}
          onChange={(next) => patch({ parkingTypes: next.length ? next : undefined })}
        />
      </Section>

      {/* 6b. Удобства */}
      <Section title={t('amenitiesTitle')}>
        <AmenitiesMultiSelect
          value={draft.amenities ?? []}
          onChange={(next) => patch({ amenities: next.length ? next : undefined })}
        />
      </Section>

      {/* 7. Принимает заявки на просмотр */}
      <Section title="">
        <CheckboxRow
          label={t('toursEnabled')}
          checked={draft.toursEnabled ?? false}
          onChange={(checked) => patch({ toursEnabled: checked || undefined })}
        />
      </Section>

      {/* 8. Цокольный этаж */}
      <Section title="">
        <CheckboxRow
          label={t('isBasement')}
          checked={draft.isBasement ?? false}
          onChange={(checked) => patch({ isBasement: checked || undefined })}
        />
      </Section>

      </div>

      {/* Закреплённый футер: кнопки всегда видны без скролла (как у Zillow) */}
      <div className="flex flex-shrink-0 gap-2 border-t border-border bg-surface p-4">
        <button
          type="button"
          data-testid="filters-reset"
          onClick={handleReset}
          className="flex-1 rounded-lg border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-muted-foreground transition-colors hover:border-ink hover:text-ink"
        >
          {t('resetAll')}
        </button>
        <button
          type="button"
          data-testid="filters-apply"
          onClick={() => onApply(draft)}
          className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-primary/90"
        >
          {t('apply')}
        </button>
      </div>
    </div>
  );
}

// ─── Вспомогательные локальные компоненты ────────────────────────────────────

/** Секция с заголовком. Если title пуст — заголовок не рендерится. */
function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      {title && (
        <div className="text-[12.5px] font-bold text-muted-foreground">{title}</div>
      )}
      {children}
    </div>
  );
}

/** Одна строка чекбокса + лейбл. onChange принимает новое boolean-значение. */
function CheckboxRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const id = React.useId();
  return (
    <label
      htmlFor={id}
      className={cn(
        'flex cursor-pointer items-center gap-2 rounded-lg px-1 py-0.5',
        'text-[14px] font-medium text-ink select-none',
        'hover:text-teal',
      )}
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 cursor-pointer rounded accent-teal"
      />
      {label}
    </label>
  );
}
