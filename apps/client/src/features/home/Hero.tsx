/**
 * Hero — герой главной с крупной поисковой панелью.
 * Дефолтный вариант «photo» из дизайн-источника (home.jsx): фото-фон под
 * красно-тёмным градиентом, белый дисплейный заголовок «Недвижимость
 * Узбекистана в одном месте», подзаголовок и поисковая панель поверх.
 * 'use client' — форма интерактивна (сегмент Купить/Снять, локация, тип),
 * по «Найти» ведёт на /search?tx=...&type=...&query=... через useRouter.
 */
'use client';

import * as React from 'react';
import { useRouter } from '@/i18n/navigation';
import { MapPin, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Segment } from '@/components/ui/segment';
import { Field, SelectField } from '@/components/ui/field';
import { PhotoImg } from '@/components/ui/photo-img';
import { PROPERTY_TYPE_LABELS } from '@/lib/mock/types';
import type { PropertyType, TransactionType } from '@/lib/mock/types';

/** Фото-фон героя (как в прототипе home.jsx · HERO_PHOTO). */
const HERO_PHOTO =
  'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1600&q=70';

/** Поисковая панель: сегмент сделки + локация + тип жилья + кнопка «Найти». */
function SearchPanel() {
  const router = useRouter();
  const [tx, setTx] = React.useState<TransactionType>('SALE');
  const [type, setType] = React.useState<PropertyType | ''>('');
  const [loc, setLoc] = React.useState('');

  const submit = () => {
    // Собираем query-строку для выдачи /search.
    const params = new URLSearchParams({ tx });
    if (type) params.set('type', type);
    if (loc.trim()) params.set('query', loc.trim());
    router.push(`/search?${params.toString()}`);
  };

  return (
    <div className="rounded-[18px] bg-surface p-4 shadow-raised sm:p-[18px]">
      <Segment<TransactionType>
        className="mb-3.5"
        value={tx}
        onChange={setTx}
        options={[
          { value: 'SALE', label: 'Купить' },
          { value: 'RENT', label: 'Снять' },
        ]}
      />
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-[1.6fr_1fr_auto]">
        {/* Локация */}
        <div className="relative">
          <MapPin
            size={19}
            strokeWidth={1.9}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Field
            className="pl-[42px]"
            placeholder="Город, район или адрес"
            value={loc}
            onChange={(e) => setLoc(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            aria-label="Локация"
          />
        </div>
        {/* Тип жилья */}
        <SelectField
          value={type}
          onChange={(e) => setType(e.target.value as PropertyType | '')}
          className="cursor-pointer"
          aria-label="Тип жилья"
        >
          <option value="">Тип жилья</option>
          {(Object.entries(PROPERTY_TYPE_LABELS) as [PropertyType, string][]).map(
            ([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ),
          )}
        </SelectField>
        {/* Кнопка поиска */}
        <Button type="button" onClick={submit} className="px-[26px]">
          <Search size={18} /> Найти
        </Button>
      </div>
    </div>
  );
}

export function Hero() {
  return (
    <section className="relative min-h-[480px] bg-[linear-gradient(135deg,var(--red)_0%,#B5232A_45%,#1A1A1A_100%)]">
      {/* Фото-фон + затемняющий красно-тёмный оверлей */}
      <div className="absolute inset-0 overflow-hidden">
        <PhotoImg src={HERO_PHOTO} alt="" className="h-full w-full" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(26,26,26,.55),rgba(224,60,66,.28)_60%,rgba(26,26,26,.55))]" />
      </div>

      <div className="relative mx-auto max-w-[1280px] px-6 pb-[72px] pt-[84px]">
        <h1 className="display max-w-[720px] text-[clamp(40px,6vw,64px)] text-white [text-shadow:0_2px_24px_rgba(0,0,0,.3)]">
          Недвижимость Узбекистана
          <br />в одном месте
        </h1>
        <p className="mb-[30px] mt-[18px] max-w-[540px] text-[19px] text-white/90 [text-shadow:0_1px_12px_rgba(0,0,0,.3)]">
          Найдите квартиру, дом или новостройку для покупки и аренды — на карте и
          по фильтрам.
        </p>
        <div className="max-w-[780px]">
          <SearchPanel />
        </div>
      </div>
    </section>
  );
}
