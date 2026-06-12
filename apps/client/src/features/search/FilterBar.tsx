/**
 * FilterBar — панель фильтров выдачи поиска (перенос FilterBar из search.jsx).
 *
 * Все фильтры живут в URL query (?tx=&type=&district=&rooms=&priceMin=&...).
 * Компонент управляет URL через next/navigation (router.replace), поэтому
 * страница (server component) перечитывает searchParams и пересобирает выдачу.
 */
'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { useRouter, usePathname } from '@/i18n/navigation';
import { Search, Bell, List, Map as MapIcon } from 'lucide-react';
import { Segment } from '@/components/ui/segment';
import { Pill } from '@/components/ui/pill';
import { Field, fieldClass } from '@/components/ui/field';
import {
  Dropdown,
  DropdownTrigger,
  DropdownContent,
} from '@/components/ui/dropdown';
import { cn } from '@/lib/utils';
import { useAppSelector } from '@/store/hooks';
import { selectIsAuthenticated } from '@/store/slices/authSlice';
import { useCreateSavedSearchMutation } from '@/store/api/savedSearchesApi';
import { describeFilters, type SavedSearchFilters } from '@/lib/savedSearch';
import { getApiError } from '@/store/api/apiError';
import { useTranslations } from 'next-intl';
import {
  PROPERTY_TYPES,
  type District,
  type PropertyType,
  type SortOption,
  type TransactionType,
} from '@/lib/mock/types';

/** Значения текущих фильтров (из searchParams страницы). */
export interface FilterValues {
  tx: TransactionType;
  type?: PropertyType;
  district?: string;
  rooms?: number;
  priceMin?: string;
  priceMax?: string;
  query?: string;
  sort: SortOption;
  view: 'list' | 'map';
}

export interface FilterBarProps {
  /** Текущие значения фильтров (распарсенные из URL). */
  values: FilterValues;
  /** Список районов для дропдауна (getDistricts). */
  districts: District[];
}

const ROOM_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: '1' },
  { value: 2, label: '2' },
  { value: 3, label: '3' },
  { value: 4, label: '4+' },
];

export function FilterBar({ values, districts }: FilterBarProps) {
  const t = useTranslations();
  const tEnums = useTranslations('enums');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  /** Записывает изменения в URL query (удаляет пустые значения). */
  const setParams = React.useCallback(
    (patch: Record<string, string | number | undefined>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, val] of Object.entries(patch)) {
        if (val == null || val === '') params.delete(key);
        else params.set(key, String(val));
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  // Локальное состояние поля поиска (коммитим по Enter/blur, чтобы не дёргать URL на каждой букве).
  const [queryDraft, setQueryDraft] = React.useState(values.query ?? '');
  React.useEffect(() => setQueryDraft(values.query ?? ''), [values.query]);

  const priceActive = Boolean(values.priceMin || values.priceMax);
  const priceLabel = priceActive
    ? `Цена: ${values.priceMin || '0'}–${values.priceMax || '∞'}`
    : 'Цена';
  const roomsLabel = values.rooms
    ? `Комнат: ${values.rooms === 4 ? '4+' : values.rooms}`
    : 'Комнаты';
  const typeLabel = values.type
    ? tEnums(`propertyType.${values.type}`)
    : 'Тип жилья';
  const districtLabel = values.district || 'Район';

  // ─── Сохранить поиск ──────────────────────────────────────────────────────
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const [createSavedSearch, { isLoading: isSaving, isSuccess: isSaved, error: saveError }] =
    useCreateSavedSearchMutation();

  /** Собирает внутренний объект фильтров (param-имена GET /search). */
  const buildFilters = React.useCallback((): SavedSearchFilters => {
    const filters: SavedSearchFilters = { transaction_type: values.tx };
    if (values.type) filters.property_type = values.type;
    if (values.priceMin) filters.price_min = values.priceMin;
    if (values.priceMax) filters.price_max = values.priceMax;
    if (values.rooms != null) filters.rooms = values.rooms;
    if (values.query) filters.q = values.query;
    return filters;
  }, [values]);

  const handleSaveSearch = React.useCallback(() => {
    if (!isAuthenticated || isSaving) return;
    const filters = buildFilters();
    const name = describeFilters(filters, t) || 'Мой поиск';
    void createSavedSearch({ name, filters });
  }, [isAuthenticated, isSaving, buildFilters, createSavedSearch, t]);

  const saveApiError = getApiError(saveError);

  return (
    <div className="sticky top-[var(--header-h)] z-20 border-b border-border bg-surface">
      <div className="overflow-x-auto px-5 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex flex-nowrap items-center gap-2">
          {/* Поиск по локации/адресу */}
          <div className="relative min-w-[230px] flex-shrink-0">
            <Search
              size={17}
              strokeWidth={1.9}
              className="pointer-events-none absolute left-[13px] top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Field
              value={queryDraft}
              onChange={(e) => setQueryDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') setParams({ query: queryDraft });
              }}
              onBlur={() => setParams({ query: queryDraft })}
              placeholder="Район, адрес…"
              className="rounded-pill py-[9px] pl-[38px] pr-4"
              aria-label="Поиск по району или адресу"
            />
          </div>

          {/* Купить / Аренда */}
          <Segment<TransactionType>
            className="flex-shrink-0"
            options={[
              { value: 'SALE', label: 'Купить' },
              { value: 'RENT', label: 'Аренда' },
            ]}
            value={values.tx}
            onChange={(tx) => setParams({ tx })}
          />

          {/* Цена */}
          <Dropdown>
            <DropdownTrigger asChild>
              <TriggerButton label={priceLabel} active={priceActive} />
            </DropdownTrigger>
            <DropdownContent align="start" className="w-[260px] p-4">
              <div className="mb-2 text-[12.5px] font-bold text-muted-foreground">
                Цена, $
              </div>
              <div className="flex gap-2">
                <Field
                  inputMode="numeric"
                  placeholder="от"
                  defaultValue={values.priceMin ?? ''}
                  onBlur={(e) => setParams({ priceMin: e.target.value.trim() })}
                  className="py-2.5"
                />
                <Field
                  inputMode="numeric"
                  placeholder="до"
                  defaultValue={values.priceMax ?? ''}
                  onBlur={(e) => setParams({ priceMax: e.target.value.trim() })}
                  className="py-2.5"
                />
              </div>
            </DropdownContent>
          </Dropdown>

          {/* Комнаты */}
          <Dropdown>
            <DropdownTrigger asChild>
              <TriggerButton label={roomsLabel} active={Boolean(values.rooms)} />
            </DropdownTrigger>
            <DropdownContent align="start" className="w-[260px] p-4">
              <div className="flex flex-wrap gap-2">
                {ROOM_OPTIONS.map((r) => (
                  <Pill
                    key={r.value}
                    active={values.rooms === r.value}
                    onClick={() =>
                      setParams({
                        rooms: values.rooms === r.value ? undefined : r.value,
                      })
                    }
                  >
                    {r.label}
                  </Pill>
                ))}
              </div>
            </DropdownContent>
          </Dropdown>

          {/* Тип жилья */}
          <Dropdown>
            <DropdownTrigger asChild>
              <TriggerButton label={typeLabel} active={Boolean(values.type)} />
            </DropdownTrigger>
            <DropdownContent align="start" className="w-[240px] p-2">
              <button
                type="button"
                onClick={() => setParams({ type: undefined })}
                className={cn(
                  'flex w-full items-center rounded-lg px-3 py-[9px] text-left text-[14.5px] font-semibold text-ink transition-colors hover:bg-mint',
                  !values.type && 'bg-mint',
                )}
              >
                Любой тип
              </button>
              {PROPERTY_TYPES.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() =>
                    setParams({ type: values.type === key ? undefined : key })
                  }
                  className={cn(
                    'flex w-full items-center rounded-lg px-3 py-[9px] text-left text-[14.5px] font-semibold text-ink transition-colors hover:bg-mint',
                    values.type === key && 'bg-mint',
                  )}
                >
                  {tEnums(`propertyType.${key}`)}
                </button>
              ))}
            </DropdownContent>
          </Dropdown>

          {/* Район */}
          <Dropdown>
            <DropdownTrigger asChild>
              <TriggerButton label={districtLabel} active={Boolean(values.district)} />
            </DropdownTrigger>
            <DropdownContent align="start" className="max-h-[320px] w-[240px] overflow-y-auto p-2">
              <button
                type="button"
                onClick={() => setParams({ district: undefined })}
                className={cn(
                  'flex w-full items-center justify-between rounded-lg px-3 py-[9px] text-left text-[14.5px] font-semibold text-ink transition-colors hover:bg-mint',
                  !values.district && 'bg-mint',
                )}
              >
                Все районы
              </button>
              {districts.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() =>
                    setParams({
                      district: values.district === d.name ? undefined : d.name,
                    })
                  }
                  className={cn(
                    'flex w-full items-center justify-between gap-2 rounded-lg px-3 py-[9px] text-left text-[14.5px] font-semibold text-ink transition-colors hover:bg-mint',
                    values.district === d.name && 'bg-mint',
                  )}
                >
                  <span className="truncate">{d.name}</span>
                  <span className="text-xs font-medium text-muted-foreground">{d.count}</span>
                </button>
              ))}
            </DropdownContent>
          </Dropdown>

          {/* Сортировка */}
          <select
            value={values.sort}
            onChange={(e) => setParams({ sort: e.target.value })}
            className={cn(
              fieldClass,
              'w-auto flex-shrink-0 cursor-pointer rounded-pill py-[9px] pr-4 font-semibold',
            )}
            aria-label="Сортировка"
          >
            <option value="promotion">Сначала рекомендуемые</option>
            <option value="price_asc">Сначала дешёвые</option>
            <option value="price_desc">Сначала дорогие</option>
            <option value="area_desc">Больше площадь</option>
            <option value="date_desc">Сначала новые</option>
          </select>

          {/* Сохранить поиск — только для авторизованных (POST /saved-searches). */}
          {isAuthenticated && (
            <button
              type="button"
              onClick={handleSaveSearch}
              disabled={isSaving}
              title={saveApiError?.message}
              className={cn(
                'inline-flex flex-shrink-0 items-center gap-2 rounded-pill border-[1.5px] px-4 py-[9px] text-sm font-bold transition-colors disabled:opacity-60',
                isSaved
                  ? 'border-teal bg-mint text-teal'
                  : saveApiError
                    ? 'border-red-300 bg-surface text-red-600'
                    : 'border-border bg-surface text-teal hover:border-teal',
              )}
            >
              <Bell size={16} strokeWidth={1.9} />
              {isSaving
                ? 'Сохраняем…'
                : isSaved
                  ? 'Сохранено'
                  : saveApiError
                    ? 'Ошибка'
                    : 'Сохранить поиск'}
            </button>
          )}

          {/* Переключатель Список / Карта — только на мобайле (десктоп — сплит). */}
          <div className="ml-auto flex-shrink-0 lg:hidden">
            <div className="inline-flex gap-[2px] rounded-pill bg-segment-track p-1">
              <ViewToggleButton
                active={values.view === 'list'}
                onClick={() => setParams({ view: undefined })}
                icon={<List size={16} strokeWidth={2} />}
                label="Список"
              />
              <ViewToggleButton
                active={values.view === 'map'}
                onClick={() => setParams({ view: 'map' })}
                icon={<MapIcon size={16} strokeWidth={2} />}
                label="Карта"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Кнопка-триггер дропдауна (pill в стиле прототипа). */
const TriggerButton = React.forwardRef<
  HTMLButtonElement,
  { label: string; active?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ label, active, ...props }, ref) => (
  <button
    ref={ref}
    type="button"
    className={cn(
      'inline-flex flex-shrink-0 items-center gap-2 whitespace-nowrap rounded-pill border-[1.5px] px-4 py-[9px] text-sm font-semibold text-ink transition-colors',
      active ? 'border-teal bg-mint' : 'border-border bg-surface hover:border-ink',
    )}
    {...props}
  >
    {label}
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="m6 9 6 6 6-6" />
    </svg>
  </button>
));
TriggerButton.displayName = 'TriggerButton';

/** Кнопка переключателя вида (список/карта). */
function ViewToggleButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-pill px-[14px] py-[7px] text-sm font-bold transition-all duration-150',
        active
          ? 'bg-surface text-ink shadow-[0_1px_4px_rgba(40,34,24,0.12)]'
          : 'bg-transparent text-muted-foreground hover:text-ink',
      )}
      aria-pressed={active}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
