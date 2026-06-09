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
import Link from 'next/link';
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
import { formatMoney } from '@/lib/format';
import {
  PROPERTY_TYPE_LABELS,
  type Currency,
  type PropertyType,
  type TransactionType,
} from '@/lib/mock';
import { Progress } from './Progress';
import { PickMap, type Coords } from './PickMap';
import { PhotoUploader, type UploadPhoto } from './PhotoUploader';

/** Подписи шагов прогресс-бара. */
const STEPS = [
  'Тип',
  'Адрес',
  'Параметры',
  'Цена',
  'Фото',
  'Описание',
  'Контакты',
  'Превью',
] as const;
const TOTAL = STEPS.length;

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
  const [step, setStep] = useState(1);
  const [done, setDone] = useState(false);
  const [f, dispatch] = useReducer(reducer, INITIAL);
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    dispatch({ type: 'set', key, value });

  // У участка/коммерции нет комнат/этажей.
  const noRooms = f.type === 'LAND' || f.type === 'COMMERCIAL';

  /** Простая клиентская валидация: можно ли перейти дальше с текущего шага. */
  const canNext = (): boolean => {
    switch (step) {
      case 1:
        return Boolean(f.tx && f.type);
      case 2:
        return Boolean(f.address.trim() && f.coords);
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
        <h1 className="text-[34px]">
          Объявление отправлено
          <br />
          на модерацию
        </h1>
        <div className="my-4 flex justify-center">
          <span className="rounded-badge bg-green-bg px-3 py-1.5 text-[12.5px] font-semibold text-green">
            Статус: NEW · На проверке
          </span>
        </div>
        <p className="mx-auto mb-7 max-w-[460px] text-base text-muted-foreground">
          Модератор проверит «{f.title}» обычно в течение нескольких часов. После одобрения оно
          станет активным и появится в поиске. Автоперевод на другие языки выполнится автоматически.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Button asChild size="lg">
            <Link href="/sell">К размещению</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/">На главную</Link>
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
        <ChevronLeft size={18} /> Отмена
      </Link>
      <h1 className="mb-1.5 text-3xl">Разместить объявление</h1>
      <p className="mb-6 text-muted-foreground">
        Шаг {step} из {TOTAL} · {STEPS[step - 1]}
      </p>
      <Progress steps={[...STEPS]} step={step} />

      <div className="rounded-card bg-surface p-[26px] shadow-card">
        {/* Шаг 1 — Тип сделки и недвижимости */}
        {step === 1 && (
          <div className="flex flex-col gap-5">
            <FormField label="Тип сделки">
              <Segment<TransactionType>
                value={f.tx}
                onChange={(v) => set('tx', v)}
                options={[
                  { value: 'SALE', label: 'Продажа' },
                  { value: 'RENT', label: 'Аренда' },
                ]}
              />
            </FormField>
            <FormField label="Тип недвижимости">
              <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2.5">
                {(Object.keys(PROPERTY_TYPE_LABELS) as PropertyType[]).map((k) => {
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
                      <span className="text-[15px] font-bold">{PROPERTY_TYPE_LABELS[k]}</span>
                    </button>
                  );
                })}
              </div>
            </FormField>
          </div>
        )}

        {/* Шаг 2 — Адрес и точка на карте */}
        {step === 2 && (
          <div className="flex flex-col gap-5">
            <FormField label="Адрес" hint="Город, район, улица, дом">
              <Field
                placeholder="Ташкент, Юнусабад, ул. Амира Темура 12"
                value={f.address}
                onChange={(e) => set('address', e.target.value)}
              />
            </FormField>
            <FormField label="Точка на карте">
              <PickMap value={f.coords} onChange={(c) => set('coords', c)} />
            </FormField>
          </div>
        )}

        {/* Шаг 3 — Параметры */}
        {step === 3 && (
          <div className="flex flex-col gap-5">
            {!noRooms && (
              <FormField label="Количество комнат">
                <div className="flex flex-wrap gap-2">
                  {['Студия', '1', '2', '3', '4', '5+'].map((r) => (
                    <Chip key={r} active={f.rooms === r} onClick={() => set('rooms', r)}>
                      {r}
                    </Chip>
                  ))}
                </div>
              </FormField>
            )}
            <FormField label="Площадь, м²">
              <Field
                placeholder="например, 78"
                inputMode="numeric"
                value={f.area}
                onChange={(e) => set('area', e.target.value.replace(/\D/g, ''))}
              />
            </FormField>
            {!noRooms && (
              <div className="grid grid-cols-3 gap-3">
                <FormField label="Этаж">
                  <Field
                    placeholder="8"
                    inputMode="numeric"
                    value={f.floor}
                    onChange={(e) => set('floor', e.target.value.replace(/\D/g, ''))}
                  />
                </FormField>
                <FormField label="Этажность">
                  <Field
                    placeholder="10"
                    inputMode="numeric"
                    value={f.totalFloors}
                    onChange={(e) => set('totalFloors', e.target.value.replace(/\D/g, ''))}
                  />
                </FormField>
                <FormField label="Год постройки">
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
            <FormField label="Валюта">
              <Segment<Currency>
                value={f.currency}
                onChange={(v) => set('currency', v)}
                options={[
                  { value: 'USD', label: '$ USD' },
                  { value: 'UZS', label: 'сум UZS' },
                ]}
              />
            </FormField>
            <FormField
              label={f.tx === 'RENT' ? 'Цена за месяц' : 'Цена'}
              hint="Указывайте реальную цену — это влияет на доверие покупателей."
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
                  {f.currency === 'USD' ? '$' : 'сум'}
                </span>
              </div>
            </FormField>
          </div>
        )}

        {/* Шаг 5 — Фото */}
        {step === 5 && (
          <FormField label="Фотографии">
            <PhotoUploader photos={f.photos} setPhotos={(next) =>
              set('photos', typeof next === 'function' ? next(f.photos) : next)
            } />
          </FormField>
        )}

        {/* Шаг 6 — Описание */}
        {step === 6 && (
          <div className="flex flex-col gap-5">
            <FormField label="Язык оригинала" hint="Остальные языки сгенерируются автопереводом.">
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ['RU', 'Русский'],
                    ['UZ', 'O‘zbekcha'],
                    ['EN', 'English'],
                  ] as [Lang, string][]
                ).map(([k, v]) => (
                  <Chip key={k} active={f.lang === k} onClick={() => set('lang', k)}>
                    {v}
                  </Chip>
                ))}
              </div>
            </FormField>
            <FormField label="Заголовок">
              <Field
                placeholder="Просторная 3-комнатная у метро"
                maxLength={80}
                value={f.title}
                onChange={(e) => set('title', e.target.value)}
              />
            </FormField>
            <FormField label="Описание">
              <textarea
                rows={5}
                className={cn(fieldClass, 'resize-y')}
                placeholder="Расскажите о квартире: ремонт, инфраструктура, что рядом…"
                value={f.desc}
                onChange={(e) => set('desc', e.target.value)}
              />
            </FormField>
          </div>
        )}

        {/* Шаг 7 — Контакты */}
        {step === 7 && (
          <div className="flex flex-col gap-5">
            <FormField label="Ваше имя">
              <Field
                placeholder="Например, Алишер"
                value={f.name}
                onChange={(e) => set('name', e.target.value)}
              />
            </FormField>
            <FormField label="Телефон" hint="Покупатели увидят его для связи.">
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
                {f.price ? formatMoney(f.price, f.currency) : '—'}
                {f.tx === 'RENT' && f.price ? '/мес' : ''}
              </div>
              <div className="mt-1 text-base font-bold text-ink">{f.title || 'Без заголовка'}</div>
            </div>
            <div className="rounded-input bg-surface-2 px-4 py-1">
              <Row label="Сделка" value={f.tx === 'RENT' ? 'Аренда' : 'Продажа'} />
              <Row label="Тип" value={PROPERTY_TYPE_LABELS[f.type]} />
              <Row label="Адрес" value={f.address} />
              <Row
                label="Координаты"
                value={f.coords ? `${f.coords[0]}, ${f.coords[1]}` : null}
              />
              {!noRooms && <Row label="Комнат" value={f.rooms} />}
              <Row label="Площадь" value={f.area ? `${f.area} м²` : null} />
              {!noRooms && (
                <Row
                  label="Этаж"
                  value={f.floor && f.totalFloors ? `${f.floor}/${f.totalFloors}` : f.floor || null}
                />
              )}
              <Row label="Год" value={f.year || null} />
              <Row label="Фото" value={f.photos.length ? `${f.photos.length} шт.` : null} />
              <Row label="Контакт" value={f.name ? `${f.name} · ${f.phone}` : null} />
            </div>
            {f.desc && (
              <p className="whitespace-pre-line text-[14.5px] leading-[1.6] text-muted-foreground">
                {f.desc}
              </p>
            )}
            <p className="text-[13px] text-muted-foreground">
              Проверьте данные. После публикации объявление уйдёт на модерацию.
            </p>
          </div>
        )}
      </div>

      {/* Навигация по шагам */}
      <div className="mt-5 flex justify-between">
        <Button
          type="button"
          variant="outline"
          className={step === 1 ? 'invisible' : ''}
          onClick={() => setStep((s) => s - 1)}
        >
          <ChevronLeft size={18} /> Назад
        </Button>
        {step < TOTAL ? (
          <Button type="button" disabled={!canNext()} onClick={() => setStep((s) => s + 1)}>
            Далее <ChevronRight size={18} />
          </Button>
        ) : (
          <Button type="button" onClick={() => setDone(true)}>
            Опубликовать
          </Button>
        )}
      </div>
    </div>
  );
}
