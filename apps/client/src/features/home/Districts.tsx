/**
 * Districts — популярные районы города Ташкента (блок на главной).
 *
 * Подборка курируемая и статичная (НЕ из GET /geo/districts): справочник
 * districts содержит ~200 районов всей страны, отсортированных по русскому
 * имени, поэтому раньше сюда попадали случайные районы (Акалтын, Алат…) с
 * непереведённым `name_en` («… tumani»). Здесь фиксируем 6 центральных районов
 * города Ташкента в редакционном порядке с чистыми трёхъязычными именами —
 * секция всегда осмысленна и не зависит от состояния API/справочника.
 *
 * Каждый район — горизонтальный чип: смысловая лайн-иконка в бейдже
 * (`{@link ./districtIcons}`, красится темой) + локализованное название. Раньше
 * тут были размытые нерелевантные фото (Unsplash) — заменены на иконки. Плитка
 * ссылается на /search?district_id= (фиксированные UUID районов, seed districts).
 * Server component (async только ради locale/translations, без интерактива).
 */
import { getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { DISTRICT_ICONS } from './districtIcons';

/**
 * Курируемая подборка центральных районов города Ташкента (порядок = редакционная
 * «популярность»). `id` — фиксированные UUID из seed-миграции districts
 * (region «Toshkent shahri»); имена — чистые, без суффикса «tumani». Правится
 * вручную при смене подборки.
 */
const TASHKENT_DISTRICTS = [
  { id: 'd0000000-0000-4000-8000-000000000003', uz: 'Mirobod', ru: 'Мирабад', en: 'Mirabad' },
  { id: 'd0000000-0000-4000-8000-000000000004', uz: "Mirzo Ulug'bek", ru: 'Мирзо-Улугбек', en: 'Mirzo-Ulugbek' },
  { id: 'd0000000-0000-4000-8000-000000000012', uz: 'Yunusobod', ru: 'Юнусабад', en: 'Yunusabad' },
  { id: 'd0000000-0000-4000-8000-000000000002', uz: 'Chilonzor', ru: 'Чиланзар', en: 'Chilanzar' },
  { id: 'd0000000-0000-4000-8000-000000000007', uz: 'Shayxontohur', ru: 'Шайхантахур', en: 'Shaykhantakhur' },
  { id: 'd0000000-0000-4000-8000-000000000009', uz: 'Yakkasaroy', ru: 'Яккасарай', en: 'Yakkasaray' },
] as const;

/** Имя района по языку интерфейса: `uz→uz`, `en→en`, иначе ru. */
function districtName(d: (typeof TASHKENT_DISTRICTS)[number], locale: string): string {
  const l = locale.toLowerCase();
  if (l.startsWith('uz')) return d.uz;
  if (l.startsWith('en')) return d.en;
  return d.ru;
}

export async function Districts() {
  const locale = await getLocale();
  const t = await getTranslations('home');
  const districts = TASHKENT_DISTRICTS.map((d) => ({ id: d.id, name: districtName(d, locale) }));

  return (
    <section className="mx-auto max-w-[1280px] px-4 pt-14 sm:px-6">
      <h2 className="mb-[18px] text-2xl sm:text-[30px]">{t('districts.title')}</h2>
      <div className="grid grid-cols-1 gap-[18px] sm:grid-cols-2 lg:grid-cols-3">
        {districts.map((d) => (
          <Link
            key={d.id}
            href={`/search?tx=SALE&district_id=${encodeURIComponent(d.id)}`}
            className="group flex items-center gap-4 rounded-card border border-border bg-card p-4 transition-colors hover:border-primary/40"
          >
            {/* Смысловая иконка района в бейдже; красится темой (text-primary). */}
            <span className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-[14px] bg-primary/10 text-primary">
              {DISTRICT_ICONS[d.id]}
            </span>
            <span className="text-[17px] font-bold text-foreground">{d.name}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
