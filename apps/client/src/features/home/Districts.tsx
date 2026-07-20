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
 * Фото-обложки — статичный мок-маппинг (Unsplash) по индексу; фото не
 * соответствуют районам, поэтому размыты до цветовой «атмосферы», а название —
 * по центру в glassmorphism-чипе. Каждая плитка — ссылка на /search?district_id=
 * (фиксированные UUID районов Ташкента, seed-миграция districts).
 * Server component (async только ради locale/translations, без интерактива).
 */
import { getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { PhotoImg } from '@/components/ui/photo-img';

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

/** Мок-обложки районов (Unsplash photo id), как в дизайн-источнике. */
const COVER_IDS = [
  '1545324418-cc1a3fa10c00',
  '1480714378408-67cf0d13bc1b',
  '1486325212027-8081e485255e',
  '1496564203457-11bb12075d90',
  '1449824913935-59a10b8d2000',
  '1444723121867-7a241cacace9',
];

export async function Districts() {
  const locale = await getLocale();
  const t = await getTranslations('home');
  const districts = TASHKENT_DISTRICTS.map((d) => ({ id: d.id, name: districtName(d, locale) }));

  return (
    <section className="mx-auto max-w-[1280px] px-4 pt-14 sm:px-6">
      <h2 className="mb-[18px] text-2xl sm:text-[30px]">{t('districts.title')}</h2>
      <div className="grid grid-cols-1 gap-[18px] sm:grid-cols-2 lg:grid-cols-3">
        {districts.map((d, i) => (
          <Link
            key={d.id}
            href={`/search?tx=SALE&district_id=${encodeURIComponent(d.id)}`}
            className="group relative block aspect-[16/10] overflow-hidden rounded-card"
          >
            {/* Фото не соответствует району → размываем до цветового фона;
                scale-110 прячет прозрачные края от blur, q=40 — детали всё равно не видны. */}
            <PhotoImg
              src={`https://images.unsplash.com/photo-${COVER_IDS[i % COVER_IDS.length]}?auto=format&fit=crop&w=600&q=40`}
              alt={d.name}
              className="scale-110 blur-[24px] transition-transform duration-[400ms] group-hover:scale-[1.2]"
              sizes="(max-width: 640px) 100vw, (max-width: 1280px) 33vw, 25vw"
            />
            {/* Равномерное затемнение для контраста текста на светлых фото */}
            <div className="absolute inset-0 bg-black/20" />
            {/* Название района — glassmorphism-чип по центру карточки */}
            <div className="absolute inset-0 flex items-center justify-center p-4">
              <span className="rounded-full border border-white/25 bg-white/15 px-5 py-2.5 text-center text-[19px] font-extrabold text-white backdrop-blur-md transition-colors group-hover:bg-white/25">
                {d.name}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
