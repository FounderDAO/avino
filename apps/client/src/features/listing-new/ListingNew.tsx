/**
 * ListingNew — многошаговый визард «Разместить объявление» (порт listing-new.jsx,
 * расширенный шагами «Контакты» и «Превью»). ТОЛЬКО МОКИ: форма НЕ отправляется
 * на API — финал показывает экран «Отправлено на модерацию».
 *
 * Шаги: Тип сделки/недвижимости → Адрес/локация → Параметры → Цена → Фото →
 * Описание → Контакты → Превью → (Опубликовать) → Успех.
 * Состояние формы — локальный useReducer. Валидация — простая клиентская.
 */
'use client';

import { useReducer, useState } from 'react';
import { Link } from '@/i18n/navigation';
import { useAppSelector } from '@/store/hooks';
import { selectIsAuthenticated } from '@/store/slices/authSlice';
import {
  useCreateListingMutation,
  useUploadListingMediaMutation,
  type CreateListingBody,
} from '@/store/api/createListingApi';
import { getApiError } from '@/store/api/apiError';
import {
  Building,
  Check,
  ChevronLeft,
  ChevronRight,
  Home as HomeIcon,
  Store,
  Trees,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, fieldClass } from '@/components/ui/field';
import { Segment } from '@/components/ui/segment';
import { Chip } from '@/components/ui/pill';
import { PhotoImg } from '@/components/ui/photo-img';
import { cn } from '@/lib/utils';
import { useTranslations, useLocale } from 'next-intl';
import { formatMoney, propertyTypeLabel } from '@/lib/format';
import {
  PROPERTY_TYPES,
  type Currency,
  type PropertyType,
  type TransactionType,
} from '@/lib/mock';
import { Progress } from './Progress';
import { type Coords } from './PickMap';
import { AddressStep } from './AddressStep';
import { PhotoUploader, type UploadPhoto } from './PhotoUploader';

/** Шаги прогресс-бара (подписи — в словаре `listingNew.steps`). */
const STEPS = [
  'type',
  'address',
  'params',
  'price',
  'photos',
  'description',
  'contacts',
  'preview',
] as const;
const TOTAL = STEPS.length;

/** Варианты «количество комнат» ('studio' — код студии в стейте). */
const ROOM_OPTIONS = ['studio', '1', '2', '3', '4', '5+'] as const;

/** Язык оригинала объявления. */
type Lang = 'RU' | 'UZ' | 'EN';

/** Состояние формы визарда. */
interface FormState {
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
  photos: UploadPhoto[];
  lang: Lang;
  title: string;
  desc: string;
  name: string;
  phone: string;
}

const INITIAL: FormState = {
  tx: 'SALE',
  type: 'APARTMENT',
  address: '',
  coords: null,
  rooms: '2',
  area: '',
  floor: '',
  totalFloors: '',
  year: '',
  price: '',
  currency: 'USD',
  photos: [],
  lang: 'RU',
  title: '',
  desc: '',
  name: '',
  phone: '',
};

/** Действие редьюсера: установить поле либо заменить целиком (для photos). */
type Action = { type: 'set'; key: keyof FormState; value: FormState[keyof FormState] };

function reducer(state: FormState, action: Action): FormState {
  return { ...state, [action.key]: action.value };
}

/** Иконки типов недвижимости. */
const TYPE_ICONS: Record<PropertyType, typeof HomeIcon> = {
  APARTMENT: Building,
  HOUSE: HomeIcon,
  NEW_BUILDING: Building,
  LAND: Trees,
  COMMERCIAL: Store,
};

/** Поле формы: подпись + контент + опциональный хинт. */
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

/** Строка превью «метка — значение». */
function Row({ label, value }: { label: string; value: React.ReactNode }) {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-4 border-b border-border py-2.5 text-[14.5px] last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-semibold text-ink">{value}</span>
    </div>
  );
}

export function ListingNew() {
  const t = useTranslations('listingNew');
  const tUnits = useTranslations('units');
  const tEnums = useTranslations('enums');
  const locale = useLocale();
  const [step, setStep] = useState(1);
  const [done, setDone] = useState(false);
  const [f, dispatch] = useReducer(reducer, INITIAL);
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    dispatch({ type: 'set', key, value });

  // У участка/коммерции нет комнат/этажей.
  const noRooms = f.type === 'LAND' || f.type === 'COMMERCIAL';

  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const [createListing, { isLoading: creating, error: createError }] =
    useCreateListingMutation();
  const [uploadMedia, { isLoading: uploading }] = useUploadListingMediaMutation();
  const submitting = creating || uploading;

  // Сообщение об ошибке вне error-envelope (гость / частичный сбой медиа).
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Сколько фото не загрузилось (объявление при этом создано).
  const [mediaFailures, setMediaFailures] = useState(0);

  const apiError = getApiError(createError);

  /** Очистить «сырое» число от пробелов/разделителей → decimal-строка. */
  const cleanPrice = (raw: string): string => raw.replace(/[^\d.]/g, '');

  /** Собрать тело POST /listings из FormState. */
  const buildBody = (): CreateListingBody => {
    const body: CreateListingBody = {
      transaction_type: f.tx,
      property_type: f.type,
      original_language: f.lang,
      price: cleanPrice(f.price),
      currency: f.currency,
      translation: {
        title: f.title.trim(),
        description: f.desc.trim() || undefined,
        // Адрес — это введённый текст с районом, без resolvable uuid (geo-gap).
        // Складываем в address_note как человекочитаемую подсказку.
        address_note: f.address.trim() || undefined,
      },
    };

    if (f.area) body.area = f.area;
    if (!noRooms) {
      if (f.rooms) {
        // rooms — int; "Студия"/"5+" нормализуем (студия → 0, 5+ → 5).
        const n =
          f.rooms === 'studio' ? 0 : Number.parseInt(f.rooms, 10);
        if (Number.isFinite(n)) body.rooms = n;
      }
      if (f.floor) body.floor = Number.parseInt(f.floor, 10);
      if (f.totalFloors) body.total_floors = Number.parseInt(f.totalFloors, 10);
    }
    if (f.year) body.year_built = Number.parseInt(f.year, 10);
    if (f.address.trim()) body.address = f.address.trim();
    if (f.coords) {
      body.latitude = String(f.coords[0]);
      body.longitude = String(f.coords[1]);
    }
    // name/phone — контакт владельца, не часть create-тела.
    // TODO: опционально PATCH профиля contact_phone.
    return body;
  };

  /** Реальная публикация: создать объявление → загрузить фото по одному. */
  const handlePublish = async () => {
    setSubmitError(null);
    setMediaFailures(0);

    if (!isAuthenticated) {
      setSubmitError(t('errors.loginRequired'));
      return;
    }

    try {
      const { id } = await createListing(buildBody()).unwrap();

      let failures = 0;
      for (const ph of f.photos) {
        if (!ph.file) continue; // демо-фото без File пропускаем
        try {
          await uploadMedia({ listingId: id, file: ph.file }).unwrap();
        } catch {
          failures += 1;
        }
      }
      setMediaFailures(failures);
      setDone(true);
    } catch {
      // Ошибка создания — error-envelope покажется через apiError.
    }
  };

  /** Простая клиентская валидация: можно ли перейти дальше с текущего шага. */
  const canNext = (): boolean => {
    switch (step) {
      case 1:
        return Boolean(f.tx && f.type);
      case 2:
        // Адрес обязателен; точка на карте — необязательное уточнение (геокод/карта
        // могут быть недоступны, но объявление всё равно должно создаваться).
        return Boolean(f.address.trim());
      case 3:
        return Boolean(f.area && (noRooms || f.rooms));
      case 4:
        return Boolean(f.price);
      case 5:
        return f.photos.length > 0;
      case 6:
        return f.title.trim().length > 3;
      case 7:
        return f.name.trim().length > 1 && f.phone.replace(/\D/g, '').length >= 9;
      default:
        return true;
    }
  };

  // ---- Экран успеха ----
  if (done) {
    return (
      <div className="fade-up mx-auto max-w-[620px] px-6 py-16 text-center">
        <div className="mx-auto mb-5 flex h-21 w-21 items-center justify-center rounded-full bg-green-bg text-green">
          <Check size={42} strokeWidth={2.4} />
        </div>
        <h1 className="whitespace-pre-line text-[34px]">{t('success.title')}</h1>
        <div className="my-4 flex justify-center">
          <span className="rounded-badge bg-green-bg px-3 py-1.5 text-[12.5px] font-semibold text-green">
            {t('success.status')}
          </span>
        </div>
        <p className="mx-auto mb-7 max-w-[460px] text-base text-muted-foreground">
          {t('success.body', { title: f.title })}
        </p>
        {mediaFailures > 0 && (
          <p className="mx-auto mb-6 max-w-[460px] rounded-input bg-red/5 px-4 py-3 text-[13.5px] text-red">
            {t('success.mediaFailures', { count: mediaFailures })}
          </p>
        )}
        <div className="flex flex-wrap justify-center gap-3">
          <Button asChild size="lg">
            <Link href="/account/listings">{t('success.myListings')}</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/">{t('success.home')}</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="fade-up mx-auto max-w-[760px] px-6 pb-16 pt-7">
      <Link
        href="/sell"
        className="mb-4 inline-flex items-center gap-2 text-[14.5px] font-bold text-teal hover:text-teal-deep"
      >
        <ChevronLeft size={18} /> {t('cancel')}
      </Link>
      <h1 className="mb-1.5 text-3xl">{t('title')}</h1>
      <p className="mb-6 text-muted-foreground">
        {t('stepOf', { step, total: TOTAL })} · {t(`steps.${STEPS[step - 1]}`)}
      </p>
      <Progress steps={STEPS.map((k) => t(`steps.${k}`))} step={step} />

      <div className="rounded-card bg-surface p-[26px] shadow-card">
        {/* Шаг 1 — Тип сделки и недвижимости */}
        {step === 1 && (
          <div className="flex flex-col gap-5">
            <FormField label={t('fields.txType')}>
              <Segment<TransactionType>
                value={f.tx}
                onChange={(v) => set('tx', v)}
                options={[
                  { value: 'SALE', label: tEnums('tx.SALE') },
                  { value: 'RENT', label: tEnums('tx.RENT') },
                ]}
              />
            </FormField>
            <FormField label={t('fields.propertyType')}>
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
                      <Icon
                        size={24}
                        strokeWidth={1.8}
                        className={on ? 'text-red' : 'text-teal'}
                      />
                      <span className="text-[15px] font-bold">{propertyTypeLabel(k, tEnums)}</span>
                    </button>
                  );
                })}
              </div>
            </FormField>
          </div>
        )}

        {/* Шаг 2 — Адрес (Yandex Suggest) и точка на реальной карте */}
        {step === 2 && (
          <AddressStep
            address={f.address}
            coords={f.coords}
            onAddressChange={(v) => set('address', v)}
            onCoordsChange={(c) => set('coords', c)}
            locale={locale}
          />
        )}

        {/* Шаг 3 — Параметры */}
        {step === 3 && (
          <div className="flex flex-col gap-5">
            {!noRooms && (
              <FormField label={t('fields.rooms.label')}>
                <div className="flex flex-wrap gap-2">
                  {ROOM_OPTIONS.map((r) => (
                    <Chip key={r} active={f.rooms === r} onClick={() => set('rooms', r)}>
                      {r === 'studio' ? t('fields.rooms.studio') : r}
                    </Chip>
                  ))}
                </div>
              </FormField>
            )}
            <FormField label={t('fields.area.label')}>
              <Field
                placeholder={t('fields.area.placeholder')}
                inputMode="numeric"
                value={f.area}
                onChange={(e) => set('area', e.target.value.replace(/\D/g, ''))}
              />
            </FormField>
            {!noRooms && (
              <div className="grid grid-cols-3 gap-3">
                <FormField label={t('fields.floor')}>
                  <Field
                    placeholder="8"
                    inputMode="numeric"
                    value={f.floor}
                    onChange={(e) => set('floor', e.target.value.replace(/\D/g, ''))}
                  />
                </FormField>
                <FormField label={t('fields.totalFloors')}>
                  <Field
                    placeholder="10"
                    inputMode="numeric"
                    value={f.totalFloors}
                    onChange={(e) => set('totalFloors', e.target.value.replace(/\D/g, ''))}
                  />
                </FormField>
                <FormField label={t('fields.yearBuilt')}>
                  <Field
                    placeholder="2022"
                    inputMode="numeric"
                    value={f.year}
                    onChange={(e) => set('year', e.target.value.replace(/\D/g, ''))}
                  />
                </FormField>
              </div>
            )}
          </div>
        )}

        {/* Шаг 4 — Цена */}
        {step === 4 && (
          <div className="flex flex-col gap-5">
            <FormField label={t('fields.currency')}>
              <Segment<Currency>
                value={f.currency}
                onChange={(v) => set('currency', v)}
                options={[
                  { value: 'USD', label: t('fields.currencyUSD') },
                  { value: 'UZS', label: t('fields.currencyUZS') },
                ]}
              />
            </FormField>
            <FormField
              label={f.tx === 'RENT' ? t('fields.price.labelRent') : t('fields.price.label')}
              hint={t('fields.price.hint')}
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
          </div>
        )}

        {/* Шаг 5 — Фото */}
        {step === 5 && (
          <FormField label={t('fields.photos')}>
            <PhotoUploader photos={f.photos} setPhotos={(next) =>
              set('photos', typeof next === 'function' ? next(f.photos) : next)
            } />
          </FormField>
        )}

        {/* Шаг 6 — Описание */}
        {step === 6 && (
          <div className="flex flex-col gap-5">
            <FormField label={t('fields.lang.label')} hint={t('fields.lang.hint')}>
              <div className="flex flex-wrap gap-2">
                {(['RU', 'UZ', 'EN'] as Lang[]).map((k) => (
                  <Chip key={k} active={f.lang === k} onClick={() => set('lang', k)}>
                    {t(`languages.${k}`)}
                  </Chip>
                ))}
              </div>
            </FormField>
            <FormField label={t('fields.title.label')}>
              <Field
                placeholder={t('fields.title.placeholder')}
                maxLength={80}
                value={f.title}
                onChange={(e) => set('title', e.target.value)}
              />
            </FormField>
            <FormField label={t('fields.desc.label')}>
              <textarea
                rows={5}
                className={cn(fieldClass, 'resize-y')}
                placeholder={t('fields.desc.placeholder')}
                value={f.desc}
                onChange={(e) => set('desc', e.target.value)}
              />
            </FormField>
          </div>
        )}

        {/* Шаг 7 — Контакты */}
        {step === 7 && (
          <div className="flex flex-col gap-5">
            <FormField label={t('fields.name.label')}>
              <Field
                placeholder={t('fields.name.placeholder')}
                value={f.name}
                onChange={(e) => set('name', e.target.value)}
              />
            </FormField>
            <FormField label={t('fields.phone.label')} hint={t('fields.phone.hint')}>
              <Field
                type="tel"
                inputMode="tel"
                placeholder="+998 90 123 45 67"
                value={f.phone}
                onChange={(e) => set('phone', e.target.value)}
              />
            </FormField>
          </div>
        )}

        {/* Шаг 8 — Превью */}
        {step === 8 && (
          <div className="flex flex-col gap-4">
            {f.photos[0] && (
              <div className="aspect-[16/10] overflow-hidden rounded-input">
                <PhotoImg src={f.photos[0].url} alt={f.title} className="h-full w-full" />
              </div>
            )}
            <div>
              <div className="text-2xl font-extrabold">
                {f.price ? formatMoney(f.price, f.currency, tUnits) : '—'}
                {f.tx === 'RENT' && f.price ? tUnits('perMonth') : ''}
              </div>
              <div className="mt-1 text-base font-bold text-ink">
                {f.title || t('preview.noTitle')}
              </div>
            </div>
            <div className="rounded-input bg-surface-2 px-4 py-1">
              <Row label={t('preview.rows.tx')} value={tEnums(`tx.${f.tx}`)} />
              <Row label={t('preview.rows.type')} value={propertyTypeLabel(f.type, tEnums)} />
              <Row label={t('preview.rows.address')} value={f.address} />
              <Row
                label={t('preview.rows.coords')}
                value={f.coords ? `${f.coords[0]}, ${f.coords[1]}` : null}
              />
              {!noRooms && (
                <Row
                  label={t('preview.rows.rooms')}
                  value={f.rooms === 'studio' ? t('fields.rooms.studio') : f.rooms}
                />
              )}
              <Row
                label={t('preview.rows.area')}
                value={f.area ? tUnits('area', { value: f.area }) : null}
              />
              {!noRooms && (
                <Row
                  label={t('preview.rows.floor')}
                  value={f.floor && f.totalFloors ? `${f.floor}/${f.totalFloors}` : f.floor || null}
                />
              )}
              <Row label={t('preview.rows.year')} value={f.year || null} />
              <Row
                label={t('preview.rows.photos')}
                value={f.photos.length ? t('preview.photosCount', { count: f.photos.length }) : null}
              />
              <Row label={t('preview.rows.contact')} value={f.name ? `${f.name} · ${f.phone}` : null} />
            </div>
            {f.desc && (
              <p className="whitespace-pre-line text-[14.5px] leading-[1.6] text-muted-foreground">
                {f.desc}
              </p>
            )}
            <p className="text-[13px] text-muted-foreground">{t('preview.note')}</p>
          </div>
        )}
      </div>

      {/* Ошибки публикации (валидация 400 / доступ 403 / гость / прочее) */}
      {step === TOTAL && (apiError || submitError) && (
        <p className="mt-4 rounded-input bg-red/5 px-4 py-3 text-[13.5px] text-red">
          {apiError?.message ?? submitError}
        </p>
      )}
      {step === TOTAL && !isAuthenticated && !submitError && !apiError && (
        <p className="mt-4 rounded-input bg-surface-2 px-4 py-3 text-[13.5px] text-muted-foreground">
          {t('errors.guestHint')}
        </p>
      )}

      {/* Навигация по шагам */}
      <div className="mt-5 flex justify-between">
        <Button
          type="button"
          variant="outline"
          className={step === 1 ? 'invisible' : ''}
          onClick={() => setStep((s) => s - 1)}
        >
          <ChevronLeft size={18} /> {t('nav.back')}
        </Button>
        {step < TOTAL ? (
          <Button type="button" disabled={!canNext()} onClick={() => setStep((s) => s + 1)}>
            {t('nav.next')} <ChevronRight size={18} />
          </Button>
        ) : (
          <Button type="button" disabled={submitting} onClick={handlePublish}>
            {submitting ? t('nav.publishing') : t('nav.publish')}
          </Button>
        )}
      </div>
    </div>
  );
}
