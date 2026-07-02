'use client';

/**
 * ListingEdit — одностраничная форма редактирования собственного объявления.
 *
 * В отличие от визарда создания (ListingNew), здесь ВСЕ поля на одной странице —
 * удобнее точечно поменять цену/описание, не прокликивая шаги. Источник полей и
 * валидаторов — те же контракты, что у создания (snake_case PATCH /listings/:id),
 * адресный шаг переиспользует AddressStep (Yandex suggest + карта), фото —
 * PhotoUploader. Существующие фото = UploadPhoto без `file` (id = mediaId), новые —
 * с `file`. На «Сохранить»: PATCH полей → удалить снятые фото → загрузить новые →
 * выставить итоговый порядок (reorder).
 *
 * `original_language` сменить нельзя (ADR-005) — язык оригинала показываем
 * read-only. Статус меняет только модерация.
 */
import * as React from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import { useTranslations, useLocale } from 'next-intl';
import {
  Building,
  ChevronLeft,
  Home as HomeIcon,
  Loader2,
  Store,
  Trees,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, fieldClass } from '@/components/ui/field';
import { Segment } from '@/components/ui/segment';
import { Chip } from '@/components/ui/pill';
import { cn } from '@/lib/utils';
import { propertyTypeLabel } from '@/lib/format';
import {
  AMENITIES,
  PARKING_TYPES,
  PROPERTY_TYPES,
  type Amenity,
  type Currency,
  type ParkingType,
  type PropertyType,
  type TransactionType,
} from '@/lib/mock';
import { useAppSelector } from '@/store/hooks';
import { selectIsAuthenticated } from '@/store/slices/authSlice';
import { getApiError } from '@/store/api/apiError';
import { AddressStep } from '@/features/listing-new/AddressStep';
import { PhotoUploader, type UploadPhoto } from '@/features/listing-new/PhotoUploader';
import { type Coords } from '@/features/listing-new/PickMap';
import {
  useGetListingForEditQuery,
  useUpdateListingMutation,
  useAddListingMediaMutation,
  useDeleteListingMediaMutation,
  useReorderListingMediaMutation,
  type EditListingDetail,
  type EditListingMedia,
  type UpdateListingPatch,
} from '@/store/api/listingEditApi';
import { ToursSection } from '@/features/listing-shared/ToursSection';
import type { TourWindow, Region, District } from '@/lib/mock/types';
import { RegionDistrictSelect } from '@/features/listing-new/RegionDistrictSelect';

const ROOM_OPTIONS = ['studio', '1', '2', '3', '4', '5+'] as const;
/** Шаг 0.5 (LAST_CHANGED_API.md §1: `bathrooms` дробный, шаг 0.5, max 99). */
const BATHROOM_OPTIONS = ['1', '1.5', '2', '2.5', '3', '3.5', '4+'] as const;

const TYPE_ICONS: Record<PropertyType, typeof HomeIcon> = {
  APARTMENT: Building,
  HOUSE: HomeIcon,
  NEW_BUILDING: Building,
  LAND: Trees,
  COMMERCIAL: Store,
};

type Lang = 'RU' | 'UZ' | 'EN';

interface EditForm {
  tx: TransactionType;
  type: PropertyType;
  address: string;
  coords: Coords | null;
  regionId: string;
  districtId: string;
  rooms: string;
  bathrooms: string;
  parking: string;  // '' = Нет
  area: string;
  lotArea: string;
  /** Жилая площадь, м² (Decimal-строка, LAST_CHANGED_API.md §1). */
  livingArea: string;
  /** Нежилая площадь, м² (Decimal-строка, LAST_CHANGED_API.md §1). */
  nonLivingArea: string;
  floor: string;
  /** Цокольный этаж; при true floor не задаётся (шлём null). */
  isBasement: boolean;
  totalFloors: string;
  year: string;
  price: string;
  currency: Currency;
  lang: Lang;
  title: string;
  desc: string;
  toursEnabled: boolean;
  tourWindows: TourWindow[];
  amenities: Amenity[];
}

/** Decimal-строка с ≤2 дробными (под DECIMAL_2 бэкенда). */
function toDecimal2(raw: string): string {
  const n = Number(String(raw).replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? String(Math.round(n * 100) / 100) : '0';
}

/** API-деталь → состояние формы (snake_case → camelCase, нормализация чисел). */
export function detailToForm(d: EditListingDetail): EditForm {
  const coords: Coords | null =
    d.latitude != null && d.longitude != null
      ? [Number(d.latitude), Number(d.longitude)]
      : null;
  const rooms = d.rooms == null ? '' : d.rooms === 0 ? 'studio' : String(d.rooms);
  const bathrooms = d.bathrooms != null ? (d.bathrooms >= 4 ? '4+' : String(d.bathrooms)) : '';
  return {
    tx: d.transaction_type,
    type: d.property_type as PropertyType,
    address: d.address ?? d.address_note ?? '',
    coords,
    regionId: d.city_id ?? '',
    districtId: d.district_id ?? '',
    rooms,
    bathrooms,
    parking: d.parking_type ?? '',
    area: d.area != null && d.area !== '' ? String(Number(d.area)) : '',
    lotArea: d.lot_area != null && d.lot_area !== '' ? String(Number(d.lot_area)) : '',
    livingArea: d.living_area != null && d.living_area !== '' ? String(Number(d.living_area)) : '',
    nonLivingArea:
      d.non_living_area != null && d.non_living_area !== '' ? String(Number(d.non_living_area)) : '',
    floor: d.floor != null ? String(d.floor) : '',
    isBasement: d.is_basement ?? false,
    totalFloors: d.total_floors != null ? String(d.total_floors) : '',
    year: d.year_built != null ? String(d.year_built) : '',
    price: d.price ? String(Math.round(Number(d.price))) : '',
    currency: d.currency,
    lang: d.language,
    title: d.title ?? '',
    desc: d.description ?? '',
    toursEnabled: d.tours_enabled ?? false,
    tourWindows: d.tour_windows ?? [],
    amenities: d.amenities ?? [],
  };
}

/**
 * Чистая функция сборки тела PATCH /listings/:id из EditForm.
 * Вынесена из компонента для юнит-тестирования (Task C3).
 */
export function buildEditPatch(f: EditForm): UpdateListingPatch {
  const patch: UpdateListingPatch = {
    transaction_type: f.tx,
    property_type: f.type,
    price: toDecimal2(f.price),
    currency: f.currency,
    translation: {
      title: f.title.trim(),
      description: f.desc.trim() || undefined,
      address_note: f.address.trim() || undefined,
    },
  };
  if (f.area) patch.area = toDecimal2(f.area);
  if (f.lotArea) patch.lot_area = toDecimal2(f.lotArea);
  if (f.livingArea) patch.living_area = toDecimal2(f.livingArea);
  if (f.nonLivingArea) patch.non_living_area = toDecimal2(f.nonLivingArea);
  const noRooms = f.type === 'LAND' || f.type === 'COMMERCIAL';
  if (!noRooms) {
    if (f.rooms) {
      const n = f.rooms === 'studio' ? 0 : Number.parseInt(f.rooms, 10);
      if (Number.isFinite(n)) patch.rooms = n;
    }
    if (f.bathrooms) {
      // Дробный шаг 0.5 (LAST_CHANGED_API.md §1) — parseFloat, не parseInt.
      const b = f.bathrooms === '4+' ? 4 : Number.parseFloat(f.bathrooms);
      if (Number.isFinite(b)) patch.bathrooms = b;
    }
    // Всегда шлём (как tours_enabled/amenities ниже) — иначе снять «Цокольный
    // этаж» на редактировании было бы невозможно (omit-empty не отправил бы false).
    patch.is_basement = f.isBasement;
    if (f.isBasement) {
      patch.floor = null;
    } else if (f.floor) {
      patch.floor = Number.parseInt(f.floor, 10);
    }
    if (f.totalFloors) patch.total_floors = Number.parseInt(f.totalFloors, 10);
  }
  if (f.year) patch.year_built = Number.parseInt(f.year, 10);
  if (f.address.trim()) patch.address = f.address.trim();
  if (f.coords) {
    patch.latitude = String(f.coords[0]);
    patch.longitude = String(f.coords[1]);
  }
  patch.tours_enabled = f.toursEnabled;
  patch.tour_windows = f.tourWindows;
  if (f.parking) patch.parking_type = f.parking as ParkingType;
  // Всегда шлём массив (как tour_windows) — чтобы «снять все удобства → сохранить»
  // реально очищал их (omit-empty не дал бы отправить пустой массив на бэк).
  patch.amenities = f.amenities;
  if (f.regionId) patch.city_id = f.regionId;
  if (f.districtId) patch.district_id = f.districtId;
  return patch;
}

/** Существующие медиа → UploadPhoto[] (без `file`, id = mediaId). */
function mediaToPhotos(media: EditListingMedia[]): UploadPhoto[] {
  return [...media]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((m) => ({ id: m.id, url: m.url }));
}

/** Подпись + контент (как FormField в ListingNew). */
function FormField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-[7px] block text-[13px] font-bold">{label}</label>
      {children}
      {hint && <p className="mt-1.5 text-[12.5px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Заголовок секции одностраничной формы. */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-card bg-surface p-[26px] shadow-card">
      <h2 className="mb-4 text-lg font-extrabold">{title}</h2>
      <div className="flex flex-col gap-5">{children}</div>
    </section>
  );
}

export function ListingEdit({
  id,
  regions,
  districts,
}: {
  id: string;
  regions: Region[];
  districts: District[];
}) {
  const t = useTranslations('listingEdit');
  const tNew = useTranslations('listingNew');
  const tEnums = useTranslations('enums');
  const tUnits = useTranslations('units');
  const locale = useLocale();
  const router = useRouter();
  const isAuthenticated = useAppSelector(selectIsAuthenticated);

  const { data, isLoading, isError } = useGetListingForEditQuery(id, {
    skip: !isAuthenticated,
  });

  const [updateListing] = useUpdateListingMutation();
  const [addMedia] = useAddListingMediaMutation();
  const [deleteMedia] = useDeleteListingMediaMutation();
  const [reorderMedia] = useReorderListingMediaMutation();

  const [f, setF] = React.useState<EditForm | null>(null);
  const [photos, setPhotos] = React.useState<UploadPhoto[]>([]);
  const [originalIds, setOriginalIds] = React.useState<string[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  // Префилл, когда пришли данные.
  React.useEffect(() => {
    if (!data) return;
    setF(detailToForm(data));
    setPhotos(mediaToPhotos(data.media));
    setOriginalIds(data.media.map((m) => m.id));
  }, [data]);

  const set = <K extends keyof EditForm>(key: K, value: EditForm[K]) =>
    setF((prev) => (prev ? { ...prev, [key]: value } : prev));

  // ── Состояния-заглушки ──
  const notice = (title: string, text: string, withBack = true) => (
    <div className="mx-auto max-w-[620px] px-6 py-20 text-center">
      <h1 className="mb-2 text-[28px]">{title}</h1>
      <p className="mb-6 text-muted-foreground">{text}</p>
      {withBack && (
        <Button asChild>
          <Link href="/account/my-listings">{t('backToListings')}</Link>
        </Button>
      )}
    </div>
  );

  if (!isAuthenticated) {
    return notice(t('authTitle'), t('authText'));
  }
  if (isLoading || (!f && !isError)) {
    return (
      <div className="mx-auto flex max-w-[620px] items-center justify-center gap-3 px-6 py-24 text-muted-foreground">
        <Loader2 className="animate-spin" size={20} /> {t('loading')}
      </div>
    );
  }
  if (isError || !f) {
    return notice(t('notFoundTitle'), t('notFoundText'));
  }

  const noRooms = f.type === 'LAND' || f.type === 'COMMERCIAL';
  const canSave =
    f.title.trim().length > 3 &&
    Boolean(f.price) &&
    Boolean(f.address.trim()) &&
    Boolean(f.area) &&
    Boolean(f.regionId) &&
    Boolean(f.districtId) &&
    (noRooms || Boolean(f.rooms)) &&
    photos.length > 0;

  const handleSave = async () => {
    setSubmitError(null);
    if (!canSave) {
      setSubmitError(t('error.required'));
      return;
    }
    setBusy(true);
    try {
      // 1. Поля.
      await updateListing({ id, body: buildEditPatch(f) }).unwrap();

      // 2. Удалить снятые существующие фото.
      const keptIds = new Set(photos.filter((p) => !p.file).map((p) => p.id));
      for (const mid of originalIds) {
        if (!keptIds.has(mid)) {
          try {
            await deleteMedia({ listingId: id, mediaId: mid }).unwrap();
          } catch {
            /* сбой удаления одного фото не должен валить всё сохранение */
          }
        }
      }

      // 3. Загрузить новые фото; собрать итоговый порядок media id.
      const finalOrder: string[] = [];
      for (const p of photos) {
        if (p.file) {
          try {
            const created = await addMedia({ listingId: id, file: p.file }).unwrap();
            finalOrder.push(created.id);
          } catch {
            /* одно фото не загрузилось — продолжаем с остальными */
          }
        } else {
          finalOrder.push(p.id);
        }
      }

      // 4. Применить порядок (если есть что упорядочивать).
      if (finalOrder.length > 1) {
        try {
          await reorderMedia({ listingId: id, order: finalOrder }).unwrap();
        } catch {
          /* порядок не критичен — не валим сохранение */
        }
      }

      router.push('/account/my-listings');
    } catch (e) {
      const apiErr = getApiError(e as Parameters<typeof getApiError>[0]);
      setSubmitError(apiErr?.message ?? t('error.saveFailed'));
      setBusy(false);
    }
  };

  return (
    <div className="fade-up mx-auto max-w-[760px] px-6 pb-16 pt-7">
      {/* Отмена → к моим объявлениям (откуда открыли редактирование). */}
      <Link
        href="/account/my-listings"
        className="mb-4 inline-flex items-center gap-2 text-[14.5px] font-bold text-teal hover:text-teal-deep"
      >
        <ChevronLeft size={18} /> {t('backToListings')}
      </Link>
      <h1 className="mb-1.5 text-3xl">{t('title')}</h1>
      <p className="mb-6 text-muted-foreground">{t('subtitle')}</p>

      <div className="flex flex-col gap-5">
        {/* Тип сделки и недвижимости */}
        <Section title={tNew('steps.type')}>
          <FormField label={tNew('fields.txType')}>
            <Segment<TransactionType>
              value={f.tx}
              onChange={(v) => set('tx', v)}
              options={[
                { value: 'SALE', label: tEnums('tx.SALE') },
                { value: 'RENT', label: tEnums('tx.RENT') },
              ]}
            />
          </FormField>
          <FormField label={tNew('fields.propertyType')}>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2.5">
              {PROPERTY_TYPES.map((k) => {
                const on = f.type === k;
                const Icon = TYPE_ICONS[k];
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => set('type', k)}
                    className={cn(
                      'flex flex-col items-start gap-2 rounded-[12px] border-[1.5px] px-3.5 py-4 text-left transition-colors',
                      on ? 'border-red bg-red/5' : 'border-border bg-surface hover:border-ink',
                    )}
                  >
                    <Icon size={24} strokeWidth={1.8} className={on ? 'text-red' : 'text-teal'} />
                    <span className="text-[15px] font-bold">{propertyTypeLabel(k, tEnums)}</span>
                  </button>
                );
              })}
            </div>
          </FormField>
        </Section>

        {/* Адрес и точка на карте (Yandex suggest + карта) */}
        <Section title={tNew('steps.address')}>
          <RegionDistrictSelect
            regions={regions}
            districts={districts}
            regionId={f.regionId || undefined}
            districtId={f.districtId || undefined}
            onChange={({ regionId, districtId }) => {
              set('regionId', regionId ?? '');
              set('districtId', districtId ?? '');
            }}
          />
          <AddressStep
            address={f.address}
            coords={f.coords}
            onAddressChange={(v) => set('address', v)}
            onCoordsChange={(c) => set('coords', c)}
            locale={locale}
          />
        </Section>

        {/* Параметры */}
        <Section title={tNew('steps.params')}>
          {!noRooms && (
            <FormField label={tNew('fields.rooms.label')}>
              <div className="flex flex-wrap gap-2">
                {ROOM_OPTIONS.map((r) => (
                  <Chip key={r} active={f.rooms === r} onClick={() => set('rooms', r)}>
                    {r === 'studio' ? tNew('fields.rooms.studio') : r}
                  </Chip>
                ))}
              </div>
            </FormField>
          )}
          {!noRooms && (
            <FormField label={tNew('fields.bathrooms.label')}>
              <div className="flex flex-wrap gap-2">
                {BATHROOM_OPTIONS.map((b) => (
                  <Chip
                    key={b}
                    active={f.bathrooms === b}
                    onClick={() => set('bathrooms', f.bathrooms === b ? '' : b)}
                  >
                    {b}
                  </Chip>
                ))}
              </div>
            </FormField>
          )}
          <FormField label={tNew('fields.parking.label')}>
            <div className="flex flex-wrap gap-2">
              <Chip active={f.parking === ''} onClick={() => set('parking', '')}>
                {tNew('fields.parking.none')}
              </Chip>
              {PARKING_TYPES.map((p) => (
                <Chip key={p} active={f.parking === p} onClick={() => set('parking', p)}>
                  {tEnums(`parking.${p}`)}
                </Chip>
              ))}
            </div>
          </FormField>
          <FormField label={tNew('fields.amenities.label')}>
            <div className="flex flex-wrap gap-2">
              {AMENITIES.map((a) => (
                <Chip
                  key={a}
                  active={f.amenities.includes(a)}
                  onClick={() =>
                    set(
                      'amenities',
                      f.amenities.includes(a)
                        ? f.amenities.filter((v) => v !== a)
                        : ([...f.amenities, a] as Amenity[]),
                    )
                  }
                >
                  {tEnums(`amenities.${a}`)}
                </Chip>
              ))}
            </div>
          </FormField>
          <FormField label={tNew('fields.area.label')}>
            <Field
              placeholder={tNew('fields.area.placeholder')}
              inputMode="decimal"
              value={f.area}
              onChange={(e) => set('area', e.target.value.replace(/[^\d.]/g, ''))}
            />
          </FormField>
          {!noRooms && (
            <div className="grid grid-cols-2 gap-3">
              <FormField label={tNew('fields.livingArea.label')}>
                <Field
                  placeholder={tNew('fields.livingArea.placeholder')}
                  inputMode="decimal"
                  value={f.livingArea}
                  onChange={(e) => set('livingArea', e.target.value.replace(/[^\d.]/g, ''))}
                />
              </FormField>
              <FormField label={tNew('fields.nonLivingArea.label')}>
                <Field
                  placeholder={tNew('fields.nonLivingArea.placeholder')}
                  inputMode="decimal"
                  value={f.nonLivingArea}
                  onChange={(e) => set('nonLivingArea', e.target.value.replace(/[^\d.]/g, ''))}
                />
              </FormField>
            </div>
          )}
          {(f.type === 'HOUSE' || f.type === 'LAND') && (
            <FormField label={tNew('fields.lotArea.label')}>
              <Field
                placeholder={tNew('fields.lotArea.placeholder')}
                inputMode="decimal"
                value={f.lotArea}
                onChange={(e) => set('lotArea', e.target.value.replace(/[^\d.]/g, ''))}
              />
            </FormField>
          )}
          {!noRooms && (
            <label className="flex items-center gap-2 text-[14px] font-semibold text-ink">
              <input
                type="checkbox"
                checked={f.isBasement}
                onChange={(e) => {
                  const checked = e.target.checked;
                  set('isBasement', checked);
                  if (checked) set('floor', '');
                }}
                className="h-4 w-4 rounded border-border accent-ink"
              />
              {tNew('fields.isBasement')}
            </label>
          )}
          {!noRooms && (
            <div className="grid grid-cols-3 gap-3">
              <FormField label={tNew('fields.floor')}>
                <Field
                  placeholder="8"
                  inputMode="numeric"
                  disabled={f.isBasement}
                  value={f.floor}
                  onChange={(e) => set('floor', e.target.value.replace(/\D/g, ''))}
                />
              </FormField>
              <FormField label={tNew('fields.totalFloors')}>
                <Field
                  placeholder="10"
                  inputMode="numeric"
                  value={f.totalFloors}
                  onChange={(e) => set('totalFloors', e.target.value.replace(/\D/g, ''))}
                />
              </FormField>
              <FormField label={tNew('fields.yearBuilt')}>
                <Field
                  placeholder="2022"
                  inputMode="numeric"
                  value={f.year}
                  onChange={(e) => set('year', e.target.value.replace(/\D/g, ''))}
                />
              </FormField>
            </div>
          )}
        </Section>

        {/* Цена */}
        <Section title={tNew('steps.price')}>
          <FormField label={tNew('fields.currency')}>
            <Segment<Currency>
              value={f.currency}
              onChange={(v) => set('currency', v)}
              options={[
                { value: 'USD', label: tNew('fields.currencyUSD') },
                { value: 'UZS', label: tNew('fields.currencyUZS') },
              ]}
            />
          </FormField>
          <FormField
            label={f.tx === 'RENT' ? tNew('fields.price.labelRent') : tNew('fields.price.label')}
            hint={tNew('fields.price.hint')}
          >
            <div className="relative">
              <Field
                className="pl-11 text-lg font-bold"
                placeholder="0"
                inputMode="numeric"
                value={f.price ? Number(f.price).toLocaleString('en-US') : ''}
                onChange={(e) => set('price', e.target.value.replace(/\D/g, ''))}
              />
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 font-bold text-muted-foreground">
                {f.currency === 'USD' ? '$' : tUnits('sum')}
              </span>
            </div>
          </FormField>
        </Section>

        {/* Фото */}
        <Section title={tNew('steps.photos')}>
          <FormField label={tNew('fields.photos')}>
            <PhotoUploader
              photos={photos}
              setPhotos={(next) =>
                setPhotos((prev) => (typeof next === 'function' ? next(prev) : next))
              }
            />
          </FormField>
        </Section>

        {/* Описание */}
        <Section title={tNew('steps.description')}>
          <FormField label={tNew('fields.lang.label')} hint={t('langImmutable')}>
            <div className="flex flex-wrap gap-2">
              {(['RU', 'UZ', 'EN'] as Lang[]).map((k) => (
                <Chip key={k} active={f.lang === k} disabled>
                  {tNew(`languages.${k}`)}
                </Chip>
              ))}
            </div>
          </FormField>
          <FormField label={tNew('fields.title.label')}>
            <Field
              placeholder={tNew('fields.title.placeholder')}
              maxLength={80}
              value={f.title}
              onChange={(e) => set('title', e.target.value)}
            />
          </FormField>
          <FormField label={tNew('fields.desc.label')}>
            <textarea
              rows={5}
              className={cn(fieldClass, 'resize-y')}
              placeholder={tNew('fields.desc.placeholder')}
              value={f.desc}
              onChange={(e) => set('desc', e.target.value)}
            />
          </FormField>
        </Section>

        {/* Туры (просмотры) */}
        <Section title={t('tours.title')}>
          <ToursSection
            enabled={f.toursEnabled}
            windows={f.tourWindows}
            onChange={(v) => { set('toursEnabled', v.enabled); set('tourWindows', v.windows); }}
          />
        </Section>
      </div>

      {submitError && (
        <p className="mt-4 rounded-input bg-red/5 px-4 py-3 text-[13.5px] text-red">{submitError}</p>
      )}

      {/* Действия */}
      <div className="mt-5 flex justify-between gap-3">
        <Button asChild variant="outline" disabled={busy}>
          <Link href="/account/my-listings">{t('cancel')}</Link>
        </Button>
        <Button type="button" disabled={busy || !canSave} onClick={handleSave}>
          {busy ? t('saving') : t('save')}
        </Button>
      </div>
    </div>
  );
}
