/**
 * Hero — герой главной с крупной поисковой панелью.
 * Дефолтный вариант «photo» из дизайн-источника (home.jsx): фото-фон под
 * красно-тёмным градиентом, белый дисплейный заголовок «Недвижимость
 * Узбекистана в одном месте», подзаголовок и поисковая панель поверх.
 * 'use client' — форма интерактивна (сегмент Купить/Снять, локация, тип).
 * Локация — автокомплит (как на /search): выбор района ведёт на рабочий фильтр
 * /search?...&district_id=, свободный текст — на /search?...&query= (fallback).
 */
'use client';

import * as React from 'react';
import { useRouter } from '@/i18n/navigation';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Segment } from '@/components/ui/segment';
import { SelectField } from '@/components/ui/field';
import Image from 'next/image';
import { useTranslations, useLocale } from 'next-intl';
import { SearchAutocomplete } from '@/features/search/SearchAutocomplete';
import { useGeoSuggest, type Suggestion } from '@/features/search/useGeoSuggest';
import { suggestionToLocation, type LocationParams } from '@/features/search/locationParams';
import { PROPERTY_TYPES } from '@/lib/mock/types';
import type { District, PropertyType, TransactionType } from '@/lib/mock/types';

/** Поисковая панель: сегмент сделки + локация + тип жилья + кнопка «Найти». */
function SearchPanel({ districts }: { districts: District[] }) {
  const t = useTranslations('home');
  const tEnums = useTranslations('enums');
  const tSearch = useTranslations('search');
  const router = useRouter();
  const locale = useLocale();
  const [tx, setTx] = React.useState<TransactionType>('SALE');
  const [type, setType] = React.useState<PropertyType | ''>('');
  const [loc, setLoc] = React.useState('');
  // Параметры локации из выбранной подсказки (район → district_id). null —
  // пользователь печатал свободный текст, локация уйдёт в ?query=.
  const [selected, setSelected] = React.useState<LocationParams | null>(null);
  const [suggestActive, setSuggestActive] = React.useState(false);

  const { items, loading } = useGeoSuggest(loc, {
    enabled: suggestActive,
    districts,
    locale,
  });

  const submit = () => {
    // Собираем query-строку для выдачи /search: выбранный район → district_id,
    // иначе свободный текст → query.
    const params = new URLSearchParams({ tx });
    if (type) params.set('type', type);
    const location = selected ?? (loc.trim() ? { query: loc.trim() } : {});
    if (location.district_id) params.set('district_id', location.district_id);
    else if (location.query) params.set('query', location.query);
    router.push(`/search?${params.toString()}`);
  };

  // Выбор подсказки: запоминаем локацию (район → district_id, гео → query) и
  // показываем title в поле; переход — по «Найти»/Enter.
  const handleSelect = (s: Suggestion) => {
    setLoc(s.title);
    setSelected(suggestionToLocation(s));
  };

  return (
    <div className="rounded-[18px] bg-surface p-4 shadow-raised sm:p-[18px]">
      <Segment<TransactionType>
        className="mb-3.5"
        value={tx}
        onChange={setTx}
        options={[
          { value: 'SALE', label: t('hero.buy') },
          { value: 'RENT', label: t('hero.rent') },
        ]}
      />
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-[1.6fr_1fr_auto]">
        {/* Локация — автокомплит (районы + адреса Yandex) */}
        <SearchAutocomplete
          value={loc}
          onChange={(v) => {
            setLoc(v);
            setSelected(null); // правка текста сбрасывает выбранный район
          }}
          onSelect={handleSelect}
          onSubmitRaw={() => submit()}
          onActiveChange={setSuggestActive}
          items={items}
          loading={loading}
          placeholder={t('hero.locationPlaceholder')}
          ariaLabel={t('hero.locationAria')}
          labels={{
            districts: tSearch('filters.suggestGroupDistricts'),
            addresses: tSearch('filters.suggestGroupAddresses'),
            empty: tSearch('filters.suggestEmpty'),
          }}
          className="w-full"
          inputClassName="pl-[42px]"
        />
        {/* Тип жилья */}
        <SelectField
          value={type}
          onChange={(e) => setType(e.target.value as PropertyType | '')}
          className="cursor-pointer"
          aria-label={t('hero.propertyType')}
        >
          <option value="">{t('hero.propertyType')}</option>
          {PROPERTY_TYPES.map((k) => (
            <option key={k} value={k}>
              {tEnums(`propertyType.${k}`)}
            </option>
          ))}
        </SelectField>
        {/* Кнопка поиска */}
        <Button type="button" onClick={submit} className="px-[26px]">
          <Search size={18} /> {t('hero.search')}
        </Button>
      </div>
    </div>
  );
}

export function Hero({ districts = [] }: { districts?: District[] }) {
  const t = useTranslations('home');
  return (
    <section className="relative min-h-[480px] bg-[linear-gradient(135deg,var(--red)_0%,#B5232A_45%,#1A1A1A_100%)]">
      {/* Фото-фон (self-hosted, LCP) + затемняющий красно-тёмный оверлей */}
      <div className="absolute inset-0 overflow-hidden">
        <Image src="/hero/tashkent.jpg" alt="" fill priority sizes="100vw" className="object-cover" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(26,26,26,.55),rgba(224,60,66,.28)_60%,rgba(26,26,26,.55))]" />
      </div>

      <div className="relative mx-auto max-w-[1280px] px-6 pb-[72px] pt-[84px]">
        <h1 className="display max-w-[720px] text-[clamp(40px,6vw,64px)] text-white [text-shadow:0_2px_24px_rgba(0,0,0,.3)]">
          {t('hero.title1')}
          <br />
          {t('hero.title2')}
        </h1>
        <p className="mb-[30px] mt-[18px] max-w-[540px] text-[19px] text-white/90 [text-shadow:0_1px_12px_rgba(0,0,0,.3)]">
          {t('hero.subtitle')}
        </p>
        <div className="max-w-[780px]">
          <SearchPanel districts={districts} />
        </div>
      </div>
    </section>
  );
}
