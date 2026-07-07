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

import { useEffect, useReducer, useState } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import { useAppSelector } from '@/store/hooks';
import { selectCurrentUser, selectIsAuthenticated } from '@/store/slices/authSlice';
import { isProfileCompleteForListing } from '@/lib/profile-complete';
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
  Lock,
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
  AMENITIES,
  PARKING_TYPES,
  PROPERTY_TYPES,
  type Amenity,
  type Currency,
  type ParkingType,
  type PropertyType,
  type TransactionType,
} from '@/lib/mock';
import { LoginModal } from '@/components/layout/LoginModal';
import { ContactDetailsGate } from './ContactDetailsGate';
import { Progress } from './Progress';
import { type Coords } from './PickMap';
import { AddressStep } from './AddressStep';
import { PhotoUploader, type UploadPhoto } from './PhotoUploader';
import { ToursSection } from '@/features/listing-shared/ToursSection';
import type { TourWindow, Region, District } from '@/lib/mock/types';
import { RegionDistrictSelect } from './RegionDistrictSelect';

/** Шаги прогресс-бара (подписи — в словаре `listingNew.steps`). */
const STEPS = [
  'type',
  'address',
  'params',
  'price',
  'photos',
  'description',
  'preview',
] as const;
const TOTAL = STEPS.length;

/** Варианты «количество комнат» ('studio' — код студии в стейте). */
const ROOM_OPTIONS = ['studio', '1', '2', '3', '4', '5+'] as const;

/**
 * Варианты «количество санузлов» (пусто = не выбрано, опционально).
 * 3.5 скрыт — зеркалит набор BathroomsControl фильтра поиска;
 * API по-прежнему принимает шаг 0.5 (LAST_CHANGED_API.md §1).
 */
const BATHROOM_OPTIONS = ['1', '1.5', '2', '2.5', '3', '4+'] as const;

/** Язык оригинала объявления. */
type Lang = 'RU' | 'UZ' | 'EN';

/** Состояние формы визарда. */
export interface FormState {
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
  photos: UploadPhoto[];
  lang: Lang;
  title: string;
  desc: string;
  toursEnabled: boolean;
  tourWindows: TourWindow[];
  amenities: Amenity[];
}

const INITIAL: FormState = {
  tx: 'SALE',
  type: 'APARTMENT',
  address: '',
  coords: null,
  regionId: '',
  districtId: '',
  rooms: '2',
  bathrooms: '',
  parking: '',
  area: '',
  lotArea: '',
  livingArea: '',
  nonLivingArea: '',
  floor: '',
  isBasement: false,
  totalFloors: '',
  year: '',
  price: '',
  currency: 'USD',
  photos: [],
  lang: 'RU',
  title: '',
  desc: '',
  toursEnabled: false,
  tourWindows: [],
  amenities: [],
};

/** Действие редьюсера: установить поле либо заменить целиком (для photos). */
type Action = { type: 'set'; key: keyof FormState; value: FormState[keyof FormState] };

function reducer(state: FormState, action: Action): FormState {
  return { ...state, [action.key]: action.value };
}

/**
 * Чистая функция сборки тела POST /listings из FormState.
 * Вынесена из компонента для юнит-тестирования (Task C2).
 */
export function buildListingBody(
  f: FormState,
  noRooms: boolean,
  // Поле «Заголовок» скрыто от пользователя (пока не нужно), а API требует
  // непустой translation.title — поэтому визард передаёт автособранный фолбэк.
  fallbackTitle = '',
): import('@/store/api/createListingApi').CreateListingBody {
  const cleanPrice = (raw: string) => raw.replace(/[^\d.]/g, '');
  const body: import('@/store/api/createListingApi').CreateListingBody = {
    transaction_type: f.tx,
    property_type: f.type,
    original_language: f.lang,
    price: cleanPrice(f.price),
    currency: f.currency,
    translation: {
      title: f.title.trim() || fallbackTitle,
      description: f.desc.trim() || undefined,
      address_note: f.address.trim() || undefined,
    },
  };

  if (f.area) body.area = f.area;
  if (f.lotArea) body.lot_area = f.lotArea;
  if (f.livingArea) body.living_area = f.livingArea;
  if (f.nonLivingArea) body.non_living_area = f.nonLivingArea;
  if (!noRooms) {
    if (f.rooms) {
      const n = f.rooms === 'studio' ? 0 : Number.parseInt(f.rooms, 10);
      if (Number.isFinite(n)) body.rooms = n;
    }
    if (f.bathrooms) {
      // Дробный шаг 0.5 (LAST_CHANGED_API.md §1) — parseFloat, не parseInt.
      const b = f.bathrooms === '4+' ? 4 : Number.parseFloat(f.bathrooms);
      if (Number.isFinite(b)) body.bathrooms = b;
    }
    if (f.isBasement) {
      body.is_basement = true;
      body.floor = null;
    } else if (f.floor) {
      body.floor = Number.parseInt(f.floor, 10);
    }
    if (f.totalFloors) body.total_floors = Number.parseInt(f.totalFloors, 10);
  }
  if (f.year) body.year_built = Number.parseInt(f.year, 10);
  if (f.address.trim()) body.address = f.address.trim();
  if (f.coords) {
    body.latitude = String(f.coords[0]);
    body.longitude = String(f.coords[1]);
  }
  if (f.toursEnabled) {
    body.tours_enabled = true;
    body.tour_windows = f.tourWindows;
  }
  if (f.parking) body.parking_type = f.parking as ParkingType;
  if (f.amenities.length > 0) body.amenities = f.amenities;
  if (f.districtId) body.district_id = f.districtId;
  if (f.regionId) body.city_id = f.regionId;
  return body;
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

export function ListingNew({
  regions,
  districts,
}: {
  regions: Region[];
  districts: District[];
}) {
  const t = useTranslations('listingNew');
  const tUnits = useTranslations('units');
  const tEnums = useTranslations('enums');
  const locale = useLocale();
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [done, setDone] = useState(false);
  const [f, dispatch] = useReducer(reducer, INITIAL);
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    dispatch({ type: 'set', key, value });

  // У участка/коммерции нет комнат/этажей.
  const noRooms = f.type === 'LAND' || f.type === 'COMMERCIAL';

  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const currentUser = useAppSelector(selectCurrentUser);
  const profileComplete = isProfileCompleteForListing(currentUser);
  // Гейт авторизации: /sell/new доступна только вошедшим. Гостю сразу открываем
  // модалку входа — но через эффект (после монтирования), чтобы не было SSR/
  // гидрационного мелькания модалки у уже залогиненных пользователей.
  const [loginOpen, setLoginOpen] = useState(false);
  useEffect(() => {
    if (!isAuthenticated) setLoginOpen(true);
  }, [isAuthenticated]);

  const [createListing, { isLoading: creating, error: createError }] =
    useCreateListingMutation();
  const [uploadMedia, { isLoading: uploading }] = useUploadListingMediaMutation();
  const submitting = creating || uploading;

  // Сообщение об ошибке вне error-envelope (гость / частичный сбой медиа).
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Сколько фото не загрузилось (объявление при этом создано).
  const [mediaFailures, setMediaFailures] = useState(0);

  const apiError = getApiError(createError);
  // Страховочный 422 PROFILE_INCOMPLETE от createListing: гейт выше уже должен
  // был перехватить неполный профиль, но getMe мог не успеть перечитаться —
  // показываем тот же текст, что и на гейте.
  const apiErrorMessage =
    apiError?.code === 'PROFILE_INCOMPLETE'
      ? t('errors.profileIncomplete')
      : apiError?.code === 'ACTIVE_LISTING_LIMIT_REACHED'
        ? t('errors.activeListingLimit')
        : apiError?.message;

  // Автозаголовок вместо скрытого поля «Заголовок»: тип + площадь + адрес
  // (адрес обязателен на шаге 2, поэтому строка всегда непустая).
  const autoTitle = [
    propertyTypeLabel(f.type, tEnums),
    f.area ? tUnits('area', { value: f.area }) : null,
    f.address.trim() || null,
  ]
    .filter(Boolean)
    .join(', ')
    .slice(0, 255);

  /** Собрать тело POST /listings из FormState. */
  const buildBody = (): CreateListingBody => buildListingBody(f, noRooms, autoTitle);

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
        // Адрес обязателен; регион и район также обязательны для геопривязки.
        // Точка на карте — необязательное уточнение.
        return Boolean(f.address.trim()) && Boolean(f.regionId) && Boolean(f.districtId);
      case 3:
        return Boolean(f.area && (noRooms || f.rooms));
      case 4:
        return Boolean(f.price);
      case 5:
        return f.photos.length > 0;
      // Шаг 6 всегда валиден: поле «Заголовок» скрыто, описание опционально.
      default:
        return true;
    }
  };

  // ---- Гейт авторизации (только для гостей) ----
  // Размещение объявления требует входа: показываем экран-заглушку и модалку
  // входа. После успешного входа isAuthenticated → true и рендерится визард.
  if (!isAuthenticated) {
    return (
      <>
        <div className="fade-up mx-auto max-w-[620px] px-6 py-16 text-center">
          <div className="mx-auto mb-5 flex h-21 w-21 items-center justify-center rounded-full bg-mint text-teal-deep">
            <Lock size={38} strokeWidth={2.2} />
          </div>
          <h1 className="text-[30px]">{t('auth.title')}</h1>
          <p className="mx-auto mb-7 mt-3 max-w-[460px] text-base text-muted-foreground">
            {t('auth.text')}
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Button size="lg" onClick={() => setLoginOpen(true)}>
              {t('auth.login')}
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/">{t('auth.home')}</Link>
            </Button>
          </div>
        </div>
        <LoginModal
          open={loginOpen}
          onOpenChange={setLoginOpen}
          context={t('auth.context')}
        />
      </>
    );
  }

  // ---- Гейт полноты профиля (ADR-0125) ----
  // Вошёл, но Имя/Фамилия/Телефон не заполнены → форма контактных данных
  // вместо шагов. После сохранения getMe перечитывается и гейт исчезает.
  // currentUser в условии: на холодной загрузке isAuthenticated синхронен
  // (токен), а getMe асинхронен — без него гейт мигал бы у пользователей
  // с полным профилем, пока user не догрузился.
  if (currentUser && !profileComplete) {
    return <ContactDetailsGate />;
  }

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
          {t('success.body', { title: f.title.trim() || autoTitle })}
        </p>
        {mediaFailures > 0 && (
          <p className="mx-auto mb-6 max-w-[460px] rounded-input bg-red/5 px-4 py-3 text-[13.5px] text-red">
            {t('success.mediaFailures', { count: mediaFailures })}
          </p>
        )}
        <div className="flex flex-wrap justify-center gap-3">
          <Button asChild size="lg">
            <Link href="/account/my-listings">{t('success.myListings')}</Link>
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
      {/* «Отмена» возвращает на предыдущую страницу (откуда пришёл пользователь),
          а не на лендинг /sell — иначе после «Разместить» из кабинета юзера
          выбрасывало на маркетинговую страницу. */}
      <button
        type="button"
        onClick={() => router.back()}
        className="mb-4 inline-flex items-center gap-2 text-[14.5px] font-bold text-teal hover:text-teal-deep"
      >
        <ChevronLeft size={18} /> {t('cancel')}
      </button>
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

        {/* Шаг 2 — Регион/район и адрес (Yandex Suggest) с точкой на карте */}
        {step === 2 && (
          <div className="flex flex-col gap-5">
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
              regionName={regions.find((r) => r.id === f.regionId)?.name}
              districtName={districts.find((d) => d.id === f.districtId)?.name}
              locale={locale}
            />
          </div>
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
            {!noRooms && (
              <FormField label={t('fields.bathrooms.label')}>
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
            <FormField label={t('fields.parking.label')}>
              <div className="flex flex-wrap gap-2">
                <Chip active={f.parking === ''} onClick={() => set('parking', '')}>
                  {t('fields.parking.none')}
                </Chip>
                {PARKING_TYPES.map((p) => (
                  <Chip key={p} active={f.parking === p} onClick={() => set('parking', p)}>
                    {tEnums(`parking.${p}`)}
                  </Chip>
                ))}
              </div>
            </FormField>
            <FormField label={t('fields.amenities.label')}>
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
            <FormField label={t('fields.area.label')}>
              <Field
                placeholder={t('fields.area.placeholder')}
                inputMode="numeric"
                value={f.area}
                onChange={(e) => set('area', e.target.value.replace(/\D/g, ''))}
              />
            </FormField>
            {/* Жилая/нежилая площадь скрыты (пока не нужны) — стейт и
                buildListingBody сохранены для лёгкого возврата поля. */}
            {(f.type === 'HOUSE' || f.type === 'LAND') && (
              <FormField label={t('fields.lotArea.label')}>
                <Field
                  placeholder={t('fields.lotArea.placeholder')}
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
                {t('fields.isBasement')}
              </label>
            )}
            {!noRooms && (
              <div className="grid grid-cols-3 gap-3">
                <FormField label={t('fields.floor')}>
                  <Field
                    placeholder="8"
                    inputMode="numeric"
                    disabled={f.isBasement}
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
                  value={f.price ? Number(f.price).toLocaleString('en-US') : ''}
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
            {/* Поле «Заголовок» скрыто (пока не нужно) — при публикации
                отправляется autoTitle, т.к. API требует непустой title. */}
            <FormField label={t('fields.desc.label')}>
              <textarea
                rows={5}
                className={cn(fieldClass, 'resize-y')}
                placeholder={t('fields.desc.placeholder')}
                value={f.desc}
                onChange={(e) => set('desc', e.target.value)}
              />
            </FormField>
            <ToursSection
              enabled={f.toursEnabled}
              windows={f.tourWindows}
              onChange={(v) => { set('toursEnabled', v.enabled); set('tourWindows', v.windows); }}
            />
          </div>
        )}

        {/* Шаг 7 — Превью */}
        {step === 7 && (
          <div className="flex flex-col gap-4">
            {f.photos[0] && (
              <div className="relative aspect-[16/10] overflow-hidden rounded-input">
                <PhotoImg src={f.photos[0].url} alt={f.title} />
              </div>
            )}
            <div>
              <div className="text-2xl font-extrabold">
                {f.price ? formatMoney(f.price, f.currency, tUnits) : '—'}
                {f.tx === 'RENT' && f.price ? tUnits('perMonth') : ''}
              </div>
              {/* Строка заголовка скрыта вместе с полем «Заголовок». */}
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
              {!noRooms && f.bathrooms && (
                <Row label={t('fields.bathrooms.label')} value={f.bathrooms} />
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
          {apiErrorMessage ?? submitError}
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
