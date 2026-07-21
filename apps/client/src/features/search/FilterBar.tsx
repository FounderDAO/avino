/**
 * FilterBar — панель фильтров выдачи поиска (Zillow-раскладка, Task 8).
 *
 * Все фильтры живут в URL query (?tx=&type=&district=&rooms=&priceMin=&...).
 * Компонент управляет URL через next/navigation (router.replace), поэтому
 * страница (server component) перечитывает searchParams и пересобирает выдачу.
 *
 * Раскладка:
 * [SearchAutocomplete] · [Купить ▾] · [Цена ▾] · [Комнаты ▾] · [Тип жилья ▾]
 * · [Район ▾] · [⚙ Фильтры ▾] · [Сохранить поиск] + (мобайл) Список/Карта
 *
 * Сортировка убрана из бара → Task 9.
 */
'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { useRouter, usePathname } from '@/i18n/navigation';
import { Bell, List, Map as MapIcon, Settings2 } from 'lucide-react';
import {
  Dropdown,
  DropdownTrigger,
  DropdownContent,
  DropdownItem,
} from '@/components/ui/dropdown';
import { cn } from '@/lib/utils';
import { useAppSelector } from '@/store/hooks';
import { selectIsAuthenticated } from '@/store/slices/authSlice';
import { selectTerritoryPoints } from '@/store/territorySlice';
import { useCreateSavedSearchMutation } from '@/store/api/savedSearchesApi';
import { describeFilters, type SavedSearchFilters } from '@/lib/savedSearch';
import { LoginModal } from '@/components/layout/LoginModal';
import { useTranslations, useLocale } from 'next-intl';
import { useCurrencyPreference } from '@/lib/useCurrencyPreference';
import { toast } from 'sonner';
import { SaveSearchModal } from './SaveSearchModal';
import { SearchAutocomplete } from './SearchAutocomplete';
import { useGeoSuggest, type Suggestion } from './useGeoSuggest';
import { suggestionToLocation } from './locationParams';
import { TriggerButton } from './TriggerButton';
import { BedroomsControl } from './controls/BedroomsControl';
import { BathroomsControl } from './controls/BathroomsControl';
import { HomeTypeMultiSelect } from './controls/HomeTypeMultiSelect';
import { FiltersPanel, type FiltersPanelValues } from './FiltersPanel';
import { PriceFilter } from './PriceFilter';
import {
  type Amenity,
  type District,
  type ParkingType,
  type PropertyType,
  type Region,
  type SortOption,
  type TransactionType,
} from '@/lib/mock/types';

/** Значения текущих фильтров (из searchParams страницы). */
export interface FilterValues {
  tx: TransactionType;
  /** Устаревший single-select тип (совместимость). */
  type?: PropertyType;
  /** Мультивыбор типов жилья (Task 8). */
  types?: PropertyType[];
  /** UUID выбранного района (`?district_id=`); имя резолвится по `districts`. */
  districtId?: string;
  /** UUID выбранного региона (`?region_id=`); используется для каскада «Регион → Район». */
  regionId?: string;
  /** Явный выбор «Все регионы» (`?region_id=all`) — отключает дефолтный Ташкент. */
  allRegions?: boolean;
  /** Точное число комнат. */
  rooms?: number;
  /** «N+» режим комнат. */
  roomsMin?: number;
  /** «N+» режим санузлов. */
  bathroomsMin?: number;
  priceMin?: string;
  priceMax?: string;
  query?: string;
  sort: SortOption;
  view: 'list' | 'map';
  // ── Расширенные фильтры (FiltersPanel) ──────────────────────────────────────
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
  totalFloorsMin?: string;
  totalFloorsMax?: string;
  notFirstFloor?: boolean;
  notLastFloor?: boolean;
  toursEnabled?: boolean;
  listingSource?: ('OWNER' | 'AGENCY')[];
  parkingTypes?: ParkingType[];
  amenities?: Amenity[];
  /** Только цокольные этажи (`?is_basement=true`, LAST_CHANGED_API.md §1). */
  isBasement?: boolean;
}

export interface FilterBarProps {
  /** Текущие значения фильтров (распарсенные из URL). */
  values: FilterValues;
  /** Список районов для дропдауна (GET /geo/districts). */
  districts: District[];
  /** Список регионов для каскадного дропдауна (GET /geo/regions). */
  regions: Region[];
  /**
   * Регион дефолтной выдачи (Ташкент): когда явный регион не выбран, дропдаун
   * «Район» показывает районы этого региона, а выбор района дописывает его в URL.
   */
  fallbackRegionId?: string;
}

export function FilterBar({ values, districts, regions, fallbackRegionId }: FilterBarProps) {
  const t = useTranslations();
  const tSearch = useTranslations('search');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Дропдаун «Фильтры» управляемый: «Применить» закрывает панель
  // (кнопки внутри FiltersPanel — не DropdownItem, Radix сам их не закрывает).
  const [moreOpen, setMoreOpen] = React.useState(false);

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

  /**
   * Хелпер для мультивыбора типа жилья: `type` — ПОВТОРЯЮЩИЙСЯ параметр URL.
   * Использует append, т.к. setParams умеет только set (один ключ → одно значение).
   */
  const setTypes = React.useCallback(
    (next: PropertyType[]) => {
      const params = new URLSearchParams(searchParams.toString());
      params.delete('type');
      for (const tp of next) {
        params.append('type', tp);
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  // Локальное состояние поля поиска (коммитим в URL по Enter или выбору подсказки).
  const [queryDraft, setQueryDraft] = React.useState(values.query ?? '');
  React.useEffect(() => setQueryDraft(values.query ?? ''), [values.query]);

  const locale = useLocale();
  const displayCurrency = useCurrencyPreference();
  const currencySymbol = displayCurrency === 'USD' ? tSearch('filters.currencySymbolUsd') : tSearch('filters.currencySymbolUzs');

  // Цена задаётся в конкретной валюте; при смене сум/$ старый ценовой рубеж
  // становится бессмысленным (другой масштаб) — чистим priceMin/Max/currency.
  const prevCurrencyRef = React.useRef(displayCurrency);
  React.useEffect(() => {
    if (prevCurrencyRef.current === displayCurrency) return;
    prevCurrencyRef.current = displayCurrency;
    if (values.priceMin || values.priceMax) {
      setParams({ priceMin: undefined, priceMax: undefined, currency: undefined });
    }
  }, [displayCurrency, values.priceMin, values.priceMax, setParams]);

  const [suggestActive, setSuggestActive] = React.useState(false);
  const { items, loading } = useGeoSuggest(queryDraft, {
    enabled: suggestActive,
    districts,
    locale,
  });

  /** Выбор подсказки: район → ?district_id=, гео-место → ?query=. */
  const handleSelect = React.useCallback(
    (s: Suggestion) => {
      setQueryDraft(s.title);
      setParams({
        ...suggestionToLocation(s),
        clat: undefined,
        clng: undefined,
        radius: undefined,
      });
    },
    [setParams],
  );

  /** Enter по свободному тексту. */
  const handleSubmitRaw = React.useCallback(
    (text: string) => {
      setParams({
        query: text || undefined,
        clat: undefined,
        clng: undefined,
        radius: undefined,
      });
    },
    [setParams],
  );

  // ── Лейблы триггеров ──────────────────────────────────────────────────────────

  const txLabel = values.tx === 'RENT'
    ? tSearch('filters.rent')
    : tSearch('filters.buy');

  const priceActive = Boolean(values.priceMin || values.priceMax);
  const priceLabel = priceActive
    ? tSearch('filters.priceRange', {
        min: values.priceMin || '0',
        max: values.priceMax || '∞',
      })
    : tSearch('filters.price');

  // Комнаты: roomsExact (exact) или roomsMin (N+).
  const roomsValue = values.rooms ?? values.roomsMin;
  const roomsExact = values.rooms != null;
  const roomsActive = roomsValue != null;
  const roomsLabel = roomsActive
    ? tSearch('filters.roomsCount', {
        count: roomsExact ? String(roomsValue) : `${String(roomsValue)}+`,
      })
    : tSearch('filters.rooms');

  // Тип жилья — мультивыбор.
  const selectedTypes = values.types ?? [];
  const typeLabel = selectedTypes.length > 0
    ? tSearch('filters.propertyTypeCount', { count: String(selectedTypes.length) })
    : tSearch('filters.propertyType');

  // Регион (каскад Регион → Район).
  const selectedRegion = values.regionId
    ? regions.find((r) => r.id === values.regionId)
    : undefined;
  const regionLabel =
    selectedRegion?.name ??
    (values.allRegions ? tSearch('filters.allRegions') : tSearch('filters.region'));

  // Район.
  const selectedDistrict = values.districtId
    ? districts.find((d) => d.id === values.districtId)
    : undefined;
  const districtLabel = selectedDistrict?.name ?? tSearch('filters.district');

  // Регион для каскада районов: явный выбор → регион выбранного района (ссылки
  // ?district_id= без региона) → регион дефолтной выдачи (Ташкент). Чип «Регион»
  // при этом остаётся пустым — активен только явный values.regionId.
  const cascadeRegionId =
    values.regionId ?? selectedDistrict?.regionId ?? fallbackRegionId;
  // Список районов, отфильтрованный по региону каскада.
  const regionDistricts = cascadeRegionId
    ? districts.filter((d) => d.regionId === cascadeRegionId)
    : [];

  // ⚙ Фильтры — активен, если хоть одно поле задано.
  const extraActive = Boolean(
    values.areaMin || values.areaMax ||
    values.lotAreaMin || values.lotAreaMax ||
    values.yearMin || values.yearMax || values.newConstruction ||
    values.floorMin || values.floorMax ||
    values.totalFloorsMin || values.totalFloorsMax ||
    values.notFirstFloor || values.notLastFloor ||
    values.toursEnabled || (values.listingSource?.length ?? 0) > 0 ||
    // bathroomsMin не подсвечивает «Фильтры»: секция в панели скрыта,
    // санузлы сигналит чип «Комнаты» (см. SHOW_ROOMS_AND_BATHROOMS).
    values.isBasement ||
    (values.parkingTypes?.length ?? 0) > 0 ||
    (values.amenities?.length ?? 0) > 0,
  );

  // ── FiltersPanel values ───────────────────────────────────────────────────────

  const panelValues: FiltersPanelValues = {
    roomsMin: values.roomsMin,
    bathroomsMin: values.bathroomsMin,
    areaMin: values.areaMin,
    areaMax: values.areaMax,
    lotAreaMin: values.lotAreaMin,
    lotAreaMax: values.lotAreaMax,
    yearMin: values.yearMin,
    yearMax: values.yearMax,
    newConstruction: values.newConstruction,
    floorMin: values.floorMin,
    floorMax: values.floorMax,
    notFirstFloor: values.notFirstFloor,
    notLastFloor: values.notLastFloor,
    totalFloorsMin: values.totalFloorsMin,
    totalFloorsMax: values.totalFloorsMax,
    listingSource: values.listingSource,
    toursEnabled: values.toursEnabled,
    parkingTypes: values.parkingTypes,
    amenities: values.amenities,
    isBasement: values.isBasement,
  };

  const handlePanelApply = React.useCallback(
    (next: FiltersPanelValues) => {
      // parking_type — повторяющийся параметр; setParams умеет только set.
      // Строим URLSearchParams вручную и делаем один router.replace.
      const params = new URLSearchParams(searchParams.toString());
      const setOne = (k: string, v: string | number | undefined) => {
        if (v == null || v === '') params.delete(k);
        else params.set(k, String(v));
      };
      setOne('rooms_min', next.roomsMin);
      if (next.roomsMin != null) params.delete('rooms');
      setOne('bathrooms_min', next.bathroomsMin);
      setOne('area_min', next.areaMin);
      setOne('area_max', next.areaMax);
      setOne('lot_area_min', next.lotAreaMin);
      setOne('lot_area_max', next.lotAreaMax);
      setOne('year_min', next.yearMin);
      setOne('year_max', next.yearMax);
      setOne('new_construction', next.newConstruction ? 'true' : undefined);
      setOne('floor_min', next.floorMin);
      setOne('floor_max', next.floorMax);
      setOne('total_floors_min', next.totalFloorsMin);
      setOne('total_floors_max', next.totalFloorsMax);
      setOne('not_first_floor', next.notFirstFloor ? 'true' : undefined);
      setOne('not_last_floor', next.notLastFloor ? 'true' : undefined);
      params.delete('listing_source');
      for (const s of next.listingSource ?? []) params.append('listing_source', s);
      setOne('tours_enabled', next.toursEnabled ? 'true' : undefined);
      setOne('is_basement', next.isBasement ? 'true' : undefined);
      params.delete('parking_type');
      for (const pt of next.parkingTypes ?? []) params.append('parking_type', pt);
      params.delete('amenities');
      for (const a of next.amenities ?? []) params.append('amenities', a);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  const handlePanelReset = React.useCallback(() => {
    setParams({
      rooms: undefined,
      rooms_min: undefined,
      bathrooms_min: undefined,
      area_min: undefined,
      area_max: undefined,
      lot_area_min: undefined,
      lot_area_max: undefined,
      year_min: undefined,
      year_max: undefined,
      new_construction: undefined,
      floor_min: undefined,
      floor_max: undefined,
      total_floors_min: undefined,
      total_floors_max: undefined,
      not_first_floor: undefined,
      not_last_floor: undefined,
      listing_source: undefined,
      tours_enabled: undefined,
      is_basement: undefined,
      parking_type: undefined,
      amenities: undefined,
    });
  }, [setParams]);

  // ── Сохранить поиск ──────────────────────────────────────────────────────────
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const territoryPoints = useAppSelector(selectTerritoryPoints);
  const tToasts = useTranslations('toasts');

  /** Собирает внутренний объект фильтров (param-имена GET /search). */
  const buildFilters = React.useCallback((): SavedSearchFilters => {
    const filters: SavedSearchFilters = { transaction_type: values.tx };
    // Совместимость: single-select type (старый URL) или первый из types.
    const firstType = values.type ?? values.types?.[0];
    if (firstType) filters.property_type = firstType;
    // Мультивыбор типов — сериализуем массивом для UI-восстановления.
    if (values.types && values.types.length > 0) filters.property_types = values.types;
    if (values.districtId) filters.district_id = values.districtId;
    if (values.regionId) filters.region_id = values.regionId;
    if (values.priceMin) filters.price_min = values.priceMin;
    if (values.priceMax) filters.price_max = values.priceMax;
    if (values.rooms != null) filters.rooms = values.rooms;
    if (values.roomsMin != null) filters.rooms_min = values.roomsMin;
    if (values.bathroomsMin != null) filters.bathrooms_min = values.bathroomsMin;
    if (values.query) filters.q = values.query;
    if (territoryPoints) filters.points = territoryPoints;
    // Расширенные фильтры (Task 10).
    // ВАЖНО: backend-матчинг по этим полям — follow-up (вне Phase 1).
    // Сериализуем для восстановления UI при переходе из saved-search → /search.
    if (values.areaMin) filters.area_min = values.areaMin;
    if (values.areaMax) filters.area_max = values.areaMax;
    if (values.lotAreaMin) filters.lot_area_min = values.lotAreaMin;
    if (values.lotAreaMax) filters.lot_area_max = values.lotAreaMax;
    if (values.floorMin) filters.floor_min = values.floorMin;
    if (values.floorMax) filters.floor_max = values.floorMax;
    if (values.totalFloorsMin) filters.total_floors_min = values.totalFloorsMin;
    if (values.totalFloorsMax) filters.total_floors_max = values.totalFloorsMax;
    if (values.yearMin) filters.year_min = values.yearMin;
    if (values.yearMax) filters.year_max = values.yearMax;
    if (values.newConstruction) filters.new_construction = true;
    if (values.notFirstFloor) filters.not_first_floor = true;
    if (values.notLastFloor) filters.not_last_floor = true;
    if (values.listingSource && values.listingSource.length > 0) filters.listing_source = values.listingSource;
    if (values.toursEnabled) filters.tours_enabled = true;
    if (values.isBasement) filters.is_basement = true;
    if (values.parkingTypes && values.parkingTypes.length > 0) filters.parking_types = values.parkingTypes;
    if (values.amenities && values.amenities.length > 0) filters.amenities = values.amenities;
    // Сортировка — только если пользователь отошёл от дефолта 'promotion'.
    if (values.sort && values.sort !== 'promotion') filters.sort = values.sort;
    // Валюта — только когда задана цена (иначе price_min/max нечем интерпретировать).
    if (values.priceMin || values.priceMax) filters.currency = displayCurrency;
    return filters;
  }, [values, territoryPoints, displayCurrency]);

  // Модалка входа для гостя + «отложенное намерение» открыть модалку сохранения.
  const [loginOpen, setLoginOpen] = React.useState(false);
  const [pendingSave, setPendingSave] = React.useState(false);
  const [saveModalOpen, setSaveModalOpen] = React.useState(false);
  const [createSavedSearch, { isLoading: isCreating }] = useCreateSavedSearchMutation();

  // «Сохранить поиск»: гость → вход (LoginModal) + отложенное открытие модалки;
  // авторизован → сразу модалка именования.
  const handleSaveSearch = React.useCallback(() => {
    if (!isAuthenticated) {
      setPendingSave(true);
      setLoginOpen(true);
      return;
    }
    setSaveModalOpen(true);
  }, [isAuthenticated]);

  // После входа гостя — открыть модалку именования.
  React.useEffect(() => {
    if (isAuthenticated && pendingSave) {
      setPendingSave(false);
      setSaveModalOpen(true);
    }
  }, [isAuthenticated, pendingSave]);

  // Создание из модалки. Ошибку тостит apiErrorToastMiddleware (эндпоинт не
  // в suppress-list) → при ошибке модалку не закрываем, catch глушим.
  const handleCreateSubmit = React.useCallback(
    async (name: string) => {
      try {
        await createSavedSearch({ name, filters: buildFilters() }).unwrap();
        toast.success(tToasts('savedSearchSaved'));
        setSaveModalOpen(false);
      } catch {
        /* ошибка показана тост-middleware */
      }
    },
    [createSavedSearch, buildFilters, tToasts],
  );

  return (
    <div className="sticky top-[var(--header-h)] z-20 border-b border-border bg-surface">
      <div className="overflow-x-auto px-5 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex flex-nowrap items-center gap-2">

          {/* Поиск по локации/адресу */}
          <SearchAutocomplete
            value={queryDraft}
            onChange={setQueryDraft}
            onSelect={handleSelect}
            onSubmitRaw={handleSubmitRaw}
            onActiveChange={setSuggestActive}
            items={items}
            loading={loading}
            placeholder={tSearch('filters.searchPlaceholder')}
            ariaLabel={tSearch('filters.searchAria')}
            labels={{
              districts: tSearch('filters.suggestGroupDistricts'),
              addresses: tSearch('filters.suggestGroupAddresses'),
              empty: tSearch('filters.suggestEmpty'),
            }}
          />

          {/* Купить / Аренда — Dropdown вместо Segment */}
          <Dropdown>
            <DropdownTrigger asChild>
              <TriggerButton
                label={txLabel}
                active={false}
                data-testid="filter-tx"
              />
            </DropdownTrigger>
            <DropdownContent align="start" className="w-[160px] p-1">
              {/* DropdownItem (Radix Item): меню закрывается по выбору — сырой <button> не закрывал. */}
              <DropdownItem
                onSelect={() => setParams({ tx: 'SALE' })}
                selected={values.tx === 'SALE'}
                className="text-[14.5px]"
              >
                {tSearch('filters.buy')}
              </DropdownItem>
              <DropdownItem
                onSelect={() => setParams({ tx: 'RENT' })}
                selected={values.tx === 'RENT'}
                className="text-[14.5px]"
              >
                {tSearch('filters.rent')}
              </DropdownItem>
            </DropdownContent>
          </Dropdown>

          {/* Цена — Zillow-вид (Popover + гистограмма + слайдер) */}
          <PriceFilter
            value={{ priceMin: values.priceMin, priceMax: values.priceMax }}
            tx={values.tx}
            displayCurrency={displayCurrency}
            currencySymbol={currencySymbol}
            triggerLabel={priceLabel}
            active={priceActive}
            onApply={(min, max, currency) =>
              setParams({
                priceMin: min,
                priceMax: max,
                currency: min != null || max != null ? currency : undefined,
              })
            }
            onReset={() => setParams({ priceMin: undefined, priceMax: undefined, currency: undefined })}
          />

          {/* Комнаты и санузлы в одном дропдауне (по-зилловски «Beds & Baths»);
              ширина подобрана так, чтобы каждый ряд пилюль был одной линией. */}
          <Dropdown>
            <DropdownTrigger asChild>
              <TriggerButton
                label={roomsLabel}
                active={roomsActive || values.bathroomsMin != null}
                data-testid="filter-rooms"
              />
            </DropdownTrigger>
            <DropdownContent align="start" className="w-[min(440px,92vw)] p-4">
              <div className="mb-2 text-[12.5px] font-bold text-muted-foreground">
                {tSearch('filters.rooms')}
              </div>
              <BedroomsControl
                value={roomsValue}
                exact={roomsExact}
                onChange={({ value, exact }) => {
                  if (value == null) {
                    setParams({ rooms: undefined, rooms_min: undefined });
                  } else if (exact) {
                    setParams({ rooms: value, rooms_min: undefined });
                  } else {
                    setParams({ rooms_min: value, rooms: undefined });
                  }
                }}
              />
              <div className="mb-2 mt-4 text-[12.5px] font-bold text-muted-foreground">
                {tSearch('filters.bathrooms')}
              </div>
              <BathroomsControl
                value={values.bathroomsMin}
                onChange={(value) => setParams({ bathrooms_min: value })}
              />
            </DropdownContent>
          </Dropdown>

          {/* Тип жилья — HomeTypeMultiSelect (мультивыбор) */}
          <Dropdown>
            <DropdownTrigger asChild>
              <TriggerButton
                label={typeLabel}
                active={selectedTypes.length > 0}
                data-testid="filter-type"
              />
            </DropdownTrigger>
            <DropdownContent align="start" className="w-[240px] p-2">
              <HomeTypeMultiSelect
                value={selectedTypes}
                onChange={(next) => setTypes(next)}
              />
            </DropdownContent>
          </Dropdown>

          {/* Регион — каскадный фильтр (выбор региона сбрасывает район) */}
          <Dropdown>
            <DropdownTrigger asChild>
              <TriggerButton
                label={regionLabel}
                active={Boolean(values.regionId || values.allRegions)}
                data-testid="filter-region"
              />
            </DropdownTrigger>
            <DropdownContent align="start" className="max-h-[320px] w-[240px] overflow-y-auto p-2">
              {/* DropdownItem (Radix Item): меню закрывается по выбору — сырой <button> не закрывал. */}
              {/* «Все регионы» пишем сентинелом ?region_id=all: пустой параметр
                  вернул бы дефолтный Ташкент (см. search/page.tsx). */}
              <DropdownItem
                onSelect={() => setParams({ region_id: 'all', district_id: undefined })}
                selected={Boolean(values.allRegions)}
                className="text-[14.5px]"
              >
                {tSearch('filters.allRegions')}
              </DropdownItem>
              {regions.map((r) => (
                <DropdownItem
                  key={r.id}
                  onSelect={() =>
                    setParams({
                      region_id: values.regionId === r.id ? undefined : r.id,
                      district_id: undefined,
                    })
                  }
                  selected={values.regionId === r.id}
                  className="text-[14.5px]"
                >
                  {r.name}
                </DropdownItem>
              ))}
            </DropdownContent>
          </Dropdown>

          {/* Район — зависит от выбранного региона */}
          <Dropdown>
            <DropdownTrigger asChild>
              <TriggerButton
                label={districtLabel}
                active={Boolean(values.districtId)}
                data-testid="filter-district"
                disabled={!cascadeRegionId}
                title={!cascadeRegionId ? tSearch('filters.regionRequired') : undefined}
              />
            </DropdownTrigger>
            <DropdownContent align="start" className="max-h-[320px] w-[240px] overflow-y-auto p-2">
              <DropdownItem
                onSelect={() => setParams({ district_id: undefined })}
                selected={!values.districtId}
                className="text-[14.5px]"
              >
                {tSearch('filters.allDistricts')}
              </DropdownItem>
              {regionDistricts.map((d) => (
                <DropdownItem
                  key={d.id}
                  onSelect={() =>
                    // Регион пишем в URL вместе с районом: иначе после выбора
                    // района из дефолтного (не записанного в URL) Ташкента
                    // сервер перестал бы подставлять регион и каскад ломался.
                    setParams({
                      region_id: cascadeRegionId,
                      district_id: values.districtId === d.id ? undefined : d.id,
                    })
                  }
                  selected={values.districtId === d.id}
                  className="text-[14.5px]"
                >
                  {d.name}
                </DropdownItem>
              ))}
            </DropdownContent>
          </Dropdown>

          {/* ⚙ Фильтры — FiltersPanel в прокручиваемом дропдауне */}
          <Dropdown open={moreOpen} onOpenChange={setMoreOpen}>
            <DropdownTrigger asChild>
              <TriggerButton
                label={tSearch('filters.moreFilters')}
                active={extraActive}
                icon={<Settings2 size={15} strokeWidth={2} aria-hidden />}
                data-testid="filter-more"
              />
            </DropdownTrigger>
            <DropdownContent
              align="start"
              // 440px — чтобы ряды пилюль «Комнаты»/«Санузлы» помещались одной линией.
              className="w-[min(440px,92vw)] overflow-hidden p-0"
            >
              <FiltersPanel
                values={panelValues}
                onApply={(next) => {
                  handlePanelApply(next);
                  setMoreOpen(false);
                }}
                onReset={handlePanelReset}
              />
            </DropdownContent>
          </Dropdown>

          {/* Сохранить поиск — видна всем; гость по клику получает вход
              (LoginModal), затем сохранение продолжается (POST /saved-searches). */}
          <button
            type="button"
            onClick={handleSaveSearch}
            className="inline-flex flex-shrink-0 items-center gap-2 rounded-pill border-[1.5px] border-border bg-surface px-4 py-[9px] text-sm font-bold text-teal transition-colors hover:border-teal"
          >
            <Bell size={16} strokeWidth={1.9} />
            {tSearch('filters.saveSearch')}
          </button>

          {/* Переключатель Список / Карта — только на мобайле. */}
          <div className="ml-auto flex-shrink-0 lg:hidden">
            <div className="inline-flex gap-[2px] rounded-pill bg-segment-track p-1">
              <ViewToggleButton
                active={values.view === 'list'}
                onClick={() => setParams({ view: undefined })}
                icon={<List size={16} strokeWidth={2} />}
                label={tSearch('filters.listView')}
              />
              <ViewToggleButton
                active={values.view === 'map'}
                onClick={() => setParams({ view: 'map' })}
                icon={<MapIcon size={16} strokeWidth={2} />}
                label={tSearch('filters.mapView')}
              />
            </div>
          </div>

        </div>
      </div>
      {/* Вход для гостя, нажавшего «Сохранить поиск». */}
      <LoginModal
        open={loginOpen}
        onOpenChange={setLoginOpen}
        context={tSearch('filters.saveSearchLoginPrompt')}
      />
      {/* Именование при сохранении поиска. */}
      <SaveSearchModal
        open={saveModalOpen}
        mode="create"
        initialName={describeFilters(buildFilters(), t) || tSearch('filters.mySearch')}
        onSubmit={handleCreateSubmit}
        onClose={() => setSaveModalOpen(false)}
        isSubmitting={isCreating}
      />
    </div>
  );
}

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
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
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
