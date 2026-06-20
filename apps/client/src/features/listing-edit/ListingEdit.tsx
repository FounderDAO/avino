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
  PROPERTY_TYPES,
  type Currency,
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
import type { TourWindow } from '@/lib/mock/types';

const ROOM_OPTIONS = ['studio', '1', '2', '3', '4', '5+'] as const;

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
  rooms: string;
  area: string;
  floor: string;
  totalFloors: string;
  year: string;
  price: string;
  currency: Currency;
  lang: Lang;
  title: string;
  desc: string;
  toursEnabled: boolean;
  tourWindows: TourWindow[];
}

/** Decimal-строка с ≤2 дробными (под DECIMAL_2 бэкенда). */
function toDecimal2(raw: string): string {
  const n = Number(String(raw).replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? String(Math.round(n * 100) / 100) : '0';
}

/** API-деталь → состояние формы (snake_case → camelCase, нормализация чисел). */
function detailToForm(d: EditListingDetail): EditForm {
  const coords: Coords | null =
    d.latitude != null && d.longitude != null
      ? [Number(d.latitude), Number(d.longitude)]
      : null;
  const rooms = d.rooms == null ? '' : d.rooms === 0 ? 'studio' : String(d.rooms);
  return {
    tx: d.transaction_type,
    type: d.property_type as PropertyType,
    address: d.address ?? d.address_note ?? '',
    coords,
    rooms,
    area: d.area != null && d.area !== '' ? String(Number(d.area)) : '',
    floor: d.floor != null ? String(d.floor) : '',
    totalFloors: d.total_floors != null ? String(d.total_floors) : '',
    year: d.year_built != null ? String(d.year_built) : '',
    price: d.price ? String(Math.round(Number(d.price))) : '',
    currency: d.currency,
    lang: d.language,
    title: d.title ?? '',
    desc: d.description ?? '',
    toursEnabled: d.tours_enabled ?? false,
    tourWindows: d.tour_windows ?? [],
  };
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

export function ListingEdit({ id }: { id: string }) {
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
    (noRooms || Boolean(f.rooms)) &&
    photos.length > 0;

  const buildPatch = (): UpdateListingPatch => {
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
    if (!noRooms) {
      if (f.rooms) {
        const n = f.rooms === 'studio' ? 0 : Number.parseInt(f.rooms, 10);
        if (Number.isFinite(n)) patch.rooms = n;
      }
      if (f.floor) patch.floor = Number.parseInt(f.floor, 10);
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
    return patch;
  };

  const handleSave = async () => {
    setSubmitError(null);
    if (!canSave) {
      setSubmitError(t('error.required'));
      return;
    }
    setBusy(true);
    try {
      // 1. Поля.
      await updateListing({ id, body: buildPatch() }).unwrap();

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
          <FormField label={tNew('fields.area.label')}>
            <Field
              placeholder={tNew('fields.area.placeholder')}
              inputMode="decimal"
              value={f.area}
              onChange={(e) => set('area', e.target.value.replace(/[^\d.]/g, ''))}
            />
          </FormField>
          {!noRooms && (
            <div className="grid grid-cols-3 gap-3">
              <FormField label={tNew('fields.floor')}>
                <Field
                  placeholder="8"
                  inputMode="numeric"
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
                value={f.price ? Number(f.price).toLocaleString('ru-RU') : ''}
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
