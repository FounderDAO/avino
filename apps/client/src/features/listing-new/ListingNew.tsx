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

import { useEffect, useMemo, useReducer, useState } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import { useAppSelector } from '@/store/hooks';
import {
  selectAuthResolved,
  selectCurrentUser,
  selectIsAuthenticated,
} from '@/store/slices/authSlice';
import { isProfileCompleteForListing } from '@/lib/profile-complete';
import {
  useCreateListingMutation,
  useUploadListingMediaMutation,
  type CreateListingBody,
} from '@/store/api/createListingApi';
import {
  getApiError,
  getApiErrorCode,
  isNetworkError,
  type ApiErrorDetail,
} from '@/store/api/apiError';
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
  PARKING_TYPES,
  PROPERTY_TYPES,
  type Amenity,
  type Currency,
  type ParkingType,
  type PropertyType,
  type TransactionType,
} from '@/lib/mock';
import { useListAmenitiesQuery } from '@/store/api/amenitiesApi';
import { useGetListingQuotaQuery } from '@/store/api/listingsQuotaApi';
import { amenityLabel } from '@/lib/amenities';
import { LoginModal } from '@/components/layout/LoginModal';
import { LimitReachedModal } from './LimitReachedModal';
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
  parking: string; // '' = Нет
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
type Action = {
  type: 'set';
  key: keyof FormState;
  value: FormState[keyof FormState];
};

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

/**
 * Мета по каждому серверному полю тела POST /listings: как назвать его
 * пользователю (`labelKey` — ключ в словаре `listingNew`), на каком шаге визарда
 * оно заполняется (`step` — для перехода) и опциональная понятная причина
 * (`reasonKey`). Ключ карты — нормализованный путь поля из `details[].field`
 * (индексы массивов срезаны: `tour_windows.0.start` → `tour_windows.start`).
 */
const FIELD_META: Record<
  string,
  { labelKey: string; step: number; reasonKey?: string }
> = {
  transaction_type: { labelKey: 'fields.txType', step: 1 },
  property_type: { labelKey: 'fields.propertyType', step: 1 },
  address: { labelKey: 'fields.address.label', step: 2 },
  'translation.address_note': { labelKey: 'fields.address.label', step: 2 },
  city_id: { labelKey: 'validation.region', step: 2, reasonKey: 'validation.reasons.region' },
  district_id: { labelKey: 'validation.district', step: 2, reasonKey: 'validation.reasons.district' },
  latitude: { labelKey: 'fields.mapPoint', step: 2 },
  longitude: { labelKey: 'fields.mapPoint', step: 2 },
  rooms: { labelKey: 'fields.rooms.label', step: 3 },
  bathrooms: { labelKey: 'fields.bathrooms.label', step: 3 },
  parking_type: { labelKey: 'fields.parking.label', step: 3 },
  amenities: { labelKey: 'fields.amenities.label', step: 3 },
  area: { labelKey: 'fields.area.label', step: 3, reasonKey: 'validation.reasons.area' },
  lot_area: { labelKey: 'fields.lotArea.label', step: 3 },
  living_area: { labelKey: 'fields.livingArea.label', step: 3 },
  non_living_area: { labelKey: 'fields.nonLivingArea.label', step: 3 },
  floor: { labelKey: 'fields.floor', step: 3 },
  total_floors: { labelKey: 'fields.totalFloors', step: 3 },
  year_built: { labelKey: 'fields.yearBuilt', step: 3, reasonKey: 'validation.reasons.yearBuilt' },
  price: { labelKey: 'fields.price.label', step: 4, reasonKey: 'validation.reasons.price' },
  currency: { labelKey: 'fields.currency', step: 4 },
  original_language: { labelKey: 'fields.lang.label', step: 6 },
  'translation.title': { labelKey: 'fields.title.label', step: 6 },
  'translation.description': { labelKey: 'fields.desc.label', step: 6 },
  'tour_windows.start': { labelKey: 'validation.tourWindow', step: 6 },
  'tour_windows.end': { labelKey: 'validation.tourWindow', step: 6 },
};

/** Пункт списка ошибок валидации, готовый к отрисовке. */
export interface ValidationItem {
  key: string;
  label: string;
  reason: string;
  step: number;
}

/** Срезает индексы массивов из пути поля: `tour_windows.0.start` → `tour_windows.start`. */
const normalizeField = (field: string): string =>
  field.replace(/\.\d+(?=\.|$)/g, '');

/**
 * Превращает `details[]` из error-envelope VALIDATION_ERROR в человекочитаемый,
 * дедуплицированный и отсортированный по шагам список: какое поле поправить,
 * почему и на каком шаге визарда. Неизвестные поля показываем по имени с
 * дефолтной причиной, чтобы пользователь всё равно видел конкретику.
 * Вынесено из компонента для юнит-тестирования.
 */
export function describeListingValidationErrors(
  details: ApiErrorDetail[] | undefined,
  t: (key: string) => string,
): ValidationItem[] {
  if (!details?.length) return [];
  const seen = new Set<string>();
  const items: ValidationItem[] = [];
  for (const d of details) {
    const key = normalizeField(d.field);
    if (seen.has(key)) continue;
    seen.add(key);
    const meta = FIELD_META[key];
    items.push({
      key,
      label: meta ? t(meta.labelKey) : key,
      reason: t(meta?.reasonKey ?? 'validation.reasons.default'),
      step: meta?.step ?? STEPS.length,
    });
  }
  return items.sort((a, b) => a.step - b.step);
}

/** Иконки типов недвижимости. */
const TYPE_ICONS: Record<PropertyType, typeof HomeIcon> = {
  APARTMENT: Building,
  HOUSE: HomeIcon,
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
      {hint && (
        <p className="mt-1.5 text-[12.5px] text-muted-foreground">{hint}</p>
      )}
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
  initialTx,
}: {
  regions: Region[];
  districts: District[];
  /** Предвыбранный тип сделки (?tx из /sell, например «Сдать в аренду» → RENT). */
  initialTx?: TransactionType;
}) {
  const t = useTranslations('listingNew');
  const tUnits = useTranslations('units');
  const tEnums = useTranslations('enums');
  const locale = useLocale();
  const { data: amenities = [] } = useListAmenitiesQuery();
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [done, setDone] = useState(false);
  // Ленивая инициализация: предвыбор tx из ?tx (иначе дефолт INITIAL.tx = SALE).
  const [f, dispatch] = useReducer(reducer, initialTx, (tx) => ({
    ...INITIAL,
    tx: tx ?? INITIAL.tx,
  }));
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    dispatch({ type: 'set', key, value });

  // У участка/коммерции нет комнат/этажей.
  const noRooms = f.type === 'LAND' || f.type === 'COMMERCIAL';

  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const authResolved = useAppSelector(selectAuthResolved);
  const currentUser = useAppSelector(selectCurrentUser);
  const profileComplete = isProfileCompleteForListing(currentUser);
  // Проактивный agent-gate: квота активных объявлений текущего пользователя.
  // blocked=true → сразу открываем модалку лимита (см. эффект ниже), не давая
  // заполнять форму впустую. Гость skip'ается — его перехватывает loginOpen.
  const { data: quota } = useGetListingQuotaQuery(undefined, {
    skip: !isAuthenticated,
  });
  const proactiveBlock = isAuthenticated && quota?.blocked === true;
  // Гейт авторизации: /sell/new доступна только вошедшим. Гостю сразу открываем
  // модалку входа — но через эффект (после монтирования), чтобы не было SSR/
  // гидрационного мелькания модалки у уже залогиненных пользователей.
  const [loginOpen, setLoginOpen] = useState(false);
  useEffect(() => {
    // Ждём разрешения сессии (пробный silent-refresh, ADR-0153): иначе модалка
    // мелькнула бы у вошедшего юзера, пока cookie-сессия ещё проверяется.
    if (authResolved && !isAuthenticated) setLoginOpen(true);
  }, [authResolved, isAuthenticated]);

  const [createListing, { isLoading: creating, error: createError }] =
    useCreateListingMutation();
  const [uploadMedia, { isLoading: uploading }] =
    useUploadListingMediaMutation();
  const submitting = creating || uploading;

  // Сообщение об ошибке вне error-envelope (гость / частичный сбой медиа).
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Сколько фото не загрузилось (объявление при этом создано).
  const [mediaFailures, setMediaFailures] = useState(0);
  // Код первой ошибки загрузки — чтобы объяснить причину, а не только факт.
  const [mediaErrorCode, setMediaErrorCode] = useState<string | null>(null);

  const apiError = getApiError(createError);
  // Пер-полевой разбор VALIDATION_ERROR: какое поле поправить, почему и на каком
  // шаге. Пусто для прочих ошибок — тогда показываем одиночный текст ниже.
  const validationItems = useMemo(
    () =>
      describeListingValidationErrors(
        apiError?.code === 'VALIDATION_ERROR' ? apiError.details : undefined,
        t,
      ),
    [apiError, t],
  );

  // Страховочный 422 PROFILE_INCOMPLETE от createListing: гейт выше уже должен
  // был перехватить неполный профиль, но getMe мог не успеть перечитаться —
  // показываем тот же текст, что и на гейте. VALIDATION_ERROR локализуем сами
  // (не даём утечь английскому «Invalid request body»); детальный список полей
  // рендерится отдельно, этот текст — фолбэк, когда details пусты.
  const apiErrorMessage =
    apiError?.code === 'PROFILE_INCOMPLETE'
      ? t('errors.profileIncomplete')
      : apiError?.code === 'ACTIVE_LISTING_LIMIT_REACHED'
        ? t('errors.activeListingLimit')
        : apiError?.code === 'VALIDATION_ERROR'
          ? t('validation.generic')
          : apiError?.message;

  // Единый текст ошибки, когда нет пер-полевого списка. Раньше при сетевом сбое
  // (getApiError → null) не показывалось ничего — публикация молча падала;
  // теперь всегда есть внятное сообщение.
  const hasValidationList = validationItems.length > 0;
  const genericErrorText = hasValidationList
    ? null
    : (apiErrorMessage ??
      (createError
        ? isNetworkError(createError)
          ? t('validation.networkError')
          : t('validation.unknownError')
        : submitError));

  // Причина сбоя загрузки фото по стабильному коду API (415/413/422); для
  // прочих кодов и транспортных сбоев показываем только факт без объяснения.
  const mediaFailureReason =
    mediaErrorCode === 'UNSUPPORTED_MEDIA_TYPE'
      ? t('errors.mediaUnsupportedType')
      : mediaErrorCode === 'FILE_TOO_LARGE'
        ? t('errors.mediaTooLarge')
        : mediaErrorCode === 'MEDIA_LIMIT_EXCEEDED'
          ? t('errors.mediaLimit')
          : null;

  // Достигнут лимит активных объявлений (422 ACTIVE_LISTING_LIMIT_REACHED) —
  // заметная модалка с CTA «Стать агентом» поверх инлайн-текста apiErrorMessage
  // (он остаётся как fallback после закрытия). Эффект завязан на identity
  // `createError` (не на code), чтобы повторный сабмит с тем же кодом тоже
  // открывал модалку заново.
  const [limitModalOpen, setLimitModalOpen] = useState(false);
  useEffect(() => {
    if (apiError?.code === 'ACTIVE_LISTING_LIMIT_REACHED') {
      setLimitModalOpen(true);
    }
  }, [createError, apiError]);

  // Проактивно: пользователь уже на лимите → открыть модалку сразу на маунте.
  // Отдельный эффект (не смешиваем с реактивным 422), завязан на quota.
  useEffect(() => {
    if (proactiveBlock) setLimitModalOpen(true);
  }, [proactiveBlock]);

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
  const buildBody = (): CreateListingBody =>
    buildListingBody(f, noRooms, autoTitle);

  /** Реальная публикация: создать объявление → загрузить фото по одному. */
  const handlePublish = async () => {
    setSubmitError(null);
    setMediaFailures(0);
    setMediaErrorCode(null);

    if (!isAuthenticated) {
      setSubmitError(t('errors.loginRequired'));
      return;
    }

    try {
      const { id } = await createListing(buildBody()).unwrap();

      let failures = 0;
      let firstErrorCode: string | null = null;
      for (const ph of f.photos) {
        if (!ph.file) continue; // демо-фото без File пропускаем
        try {
          await uploadMedia({ listingId: id, file: ph.file }).unwrap();
        } catch (e) {
          failures += 1;
          firstErrorCode ??= getApiErrorCode(e as Parameters<typeof getApiErrorCode>[0]);
        }
      }
      setMediaFailures(failures);
      setMediaErrorCode(firstErrorCode);
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
        return (
          Boolean(f.address.trim()) &&
          Boolean(f.regionId) &&
          Boolean(f.districtId)
        );
      case 3:
        // Год постройки обязателен для квартир/домов (категория «новостройка»
        // вычисляется из него на бэке); может быть будущим — недострой.
        return Boolean(f.area && (noRooms || (f.rooms && f.year)));
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
        <h1 className="whitespace-pre-line text-[34px]">
          {t('success.title')}
        </h1>
        <div className="my-4 flex justify-center">
          <span className="rounded-badge bg-green-bg px-3 py-1.5 text-[12.5px] font-semibold text-green">
            {t('success.status')}
          </span>
        </div>
        <p className="mx-auto mb-7 max-w-[460px] text-base text-muted-foreground">
          {t('success.body', { title: f.title.trim() || autoTitle })}
        </p>
        {mediaFailures > 0 && (
          <div className="mx-auto mb-6 max-w-[460px] space-y-1 rounded-input bg-red/5 px-4 py-3 text-[13.5px] text-red">
            <p>{t('success.mediaFailures', { count: mediaFailures })}</p>
            {mediaFailureReason && <p>{mediaFailureReason}</p>}
          </div>
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
    <>
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
          {t('stepOf', { step, total: TOTAL })} ·{' '}
          {t(`steps.${STEPS[step - 1]}`)}
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
                          on
                            ? 'border-red bg-red/5'
                            : 'border-border bg-surface hover:border-ink',
                        )}
                      >
                        <Icon
                          size={24}
                          strokeWidth={1.8}
                          className={on ? 'text-red' : 'text-teal'}
                        />
                        <span className="text-[15px] font-bold">
                          {propertyTypeLabel(k, tEnums)}
                        </span>
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
                districtName={
                  districts.find((d) => d.id === f.districtId)?.name
                }
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
                      <Chip
                        key={r}
                        active={f.rooms === r}
                        onClick={() => set('rooms', r)}
                      >
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
                        onClick={() =>
                          set('bathrooms', f.bathrooms === b ? '' : b)
                        }
                      >
                        {b}
                      </Chip>
                    ))}
                  </div>
                </FormField>
              )}
              <FormField label={t('fields.parking.label')}>
                <div className="flex flex-wrap gap-2">
                  <Chip
                    active={f.parking === ''}
                    onClick={() => set('parking', '')}
                  >
                    {t('fields.parking.none')}
                  </Chip>
                  {PARKING_TYPES.map((p) => (
                    <Chip
                      key={p}
                      active={f.parking === p}
                      onClick={() => set('parking', p)}
                    >
                      {tEnums(`parking.${p}`)}
                    </Chip>
                  ))}
                </div>
              </FormField>
              <FormField label={t('fields.amenities.label')}>
                <div className="flex flex-wrap gap-2">
                  {amenities.map((a) => (
                    <Chip
                      key={a.code}
                      active={f.amenities.includes(a.code)}
                      onClick={() =>
                        set(
                          'amenities',
                          f.amenities.includes(a.code)
                            ? f.amenities.filter((v) => v !== a.code)
                            : [...f.amenities, a.code],
                        )
                      }
                    >
                      {amenityLabel(a, locale)}
                    </Chip>
                  ))}
                </div>
              </FormField>
              <FormField label={t('fields.area.label')}>
                <Field
                  placeholder={t('fields.area.placeholder')}
                  inputMode="numeric"
                  value={f.area}
                  onChange={(e) =>
                    set('area', e.target.value.replace(/\D/g, ''))
                  }
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
                    onChange={(e) =>
                      set('lotArea', e.target.value.replace(/[^\d.]/g, ''))
                    }
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
                      onChange={(e) =>
                        set('floor', e.target.value.replace(/\D/g, ''))
                      }
                    />
                  </FormField>
                  <FormField label={t('fields.totalFloors')}>
                    <Field
                      placeholder="10"
                      inputMode="numeric"
                      value={f.totalFloors}
                      onChange={(e) =>
                        set('totalFloors', e.target.value.replace(/\D/g, ''))
                      }
                    />
                  </FormField>
                  <FormField
                    label={t('fields.yearBuilt')}
                    hint={t('fields.yearBuiltHint')}
                  >
                    <Field
                      placeholder="2022"
                      inputMode="numeric"
                      value={f.year}
                      onChange={(e) =>
                        set('year', e.target.value.replace(/\D/g, ''))
                      }
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
                label={
                  f.tx === 'RENT'
                    ? t('fields.price.labelRent')
                    : t('fields.price.label')
                }
                hint={t('fields.price.hint')}
              >
                <div className="relative">
                  <Field
                    className="pl-11 text-lg font-bold"
                    placeholder="0"
                    inputMode="numeric"
                    value={
                      f.price ? Number(f.price).toLocaleString('en-US') : ''
                    }
                    onChange={(e) =>
                      set('price', e.target.value.replace(/\D/g, ''))
                    }
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
              <PhotoUploader
                photos={f.photos}
                setPhotos={(next) =>
                  set(
                    'photos',
                    typeof next === 'function' ? next(f.photos) : next,
                  )
                }
              />
            </FormField>
          )}

          {/* Шаг 6 — Описание */}
          {step === 6 && (
            <div className="flex flex-col gap-5">
              <FormField
                label={t('fields.lang.label')}
                hint={t('fields.lang.hint')}
              >
                <div className="flex flex-wrap gap-2">
                  {(['RU', 'UZ', 'EN'] as Lang[]).map((k) => (
                    <Chip
                      key={k}
                      active={f.lang === k}
                      onClick={() => set('lang', k)}
                    >
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
                onChange={(v) => {
                  set('toursEnabled', v.enabled);
                  set('tourWindows', v.windows);
                }}
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
                <Row
                  label={t('preview.rows.tx')}
                  value={tEnums(`tx.${f.tx}`)}
                />
                <Row
                  label={t('preview.rows.type')}
                  value={propertyTypeLabel(f.type, tEnums)}
                />
                <Row label={t('preview.rows.address')} value={f.address} />
                <Row
                  label={t('preview.rows.coords')}
                  value={f.coords ? `${f.coords[0]}, ${f.coords[1]}` : null}
                />
                {!noRooms && (
                  <Row
                    label={t('preview.rows.rooms')}
                    value={
                      f.rooms === 'studio' ? t('fields.rooms.studio') : f.rooms
                    }
                  />
                )}
                {!noRooms && f.bathrooms && (
                  <Row
                    label={t('fields.bathrooms.label')}
                    value={f.bathrooms}
                  />
                )}
                <Row
                  label={t('preview.rows.area')}
                  value={f.area ? tUnits('area', { value: f.area }) : null}
                />
                {!noRooms && (
                  <Row
                    label={t('preview.rows.floor')}
                    value={
                      f.floor && f.totalFloors
                        ? `${f.floor}/${f.totalFloors}`
                        : f.floor || null
                    }
                  />
                )}
                <Row label={t('preview.rows.year')} value={f.year || null} />
                <Row
                  label={t('preview.rows.photos')}
                  value={
                    f.photos.length
                      ? t('preview.photosCount', { count: f.photos.length })
                      : null
                  }
                />
              </div>
              {f.desc && (
                <p className="whitespace-pre-line text-[14.5px] leading-[1.6] text-muted-foreground">
                  {f.desc}
                </p>
              )}
              <p className="text-[13px] text-muted-foreground">
                {t('preview.note')}
              </p>
            </div>
          )}
        </div>

        {/* Ошибки публикации: пер-полевой список при VALIDATION_ERROR — какое
          поле поправить, почему и переход на нужный шаг по клику. */}
        {step === TOTAL && hasValidationList && (
          <div className="mt-4 rounded-input bg-red/5 px-4 py-3 text-[13.5px] text-red">
            <p className="font-semibold">{t('validation.title')}</p>
            <ul className="mt-1.5 flex flex-col gap-1">
              {validationItems.map((it) => (
                <li key={it.key}>
                  <button
                    type="button"
                    onClick={() => setStep(it.step)}
                    className="text-left font-medium underline-offset-2 hover:underline"
                  >
                    {it.label} — {it.reason}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {/* Прочие ошибки (доступ 403 / гость / сеть / прочее) — один текст. */}
        {step === TOTAL && !hasValidationList && genericErrorText && (
          <p className="mt-4 rounded-input bg-red/5 px-4 py-3 text-[13.5px] text-red">
            {genericErrorText}
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
            <Button
              type="button"
              disabled={!canNext()}
              onClick={() => setStep((s) => s + 1)}
            >
              {t('nav.next')} <ChevronRight size={18} />
            </Button>
          ) : (
            <Button type="button" disabled={submitting} onClick={handlePublish}>
              {submitting ? t('nav.publishing') : t('nav.publish')}
            </Button>
          )}
        </div>
      </div>
      <LimitReachedModal
        open={limitModalOpen}
        onClose={() => {
          setLimitModalOpen(false);
          if (proactiveBlock) router.push('/account/my-listings');
        }}
      />
    </>
  );
}
