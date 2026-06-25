/**
 * Districts — популярные районы Ташкента (из home.jsx).
 * Данные берём из GET /geo/districts (lib/api/geo); фото-обложки — статичный
 * мок-маппинг (Unsplash) по индексу. Каждая плитка — ссылка на
 * /search?district_id=... Server component (async fetch, без интерактива).
 */
import { getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { PhotoImg } from '@/components/ui/photo-img';
import { getDistricts } from '@/lib/api/geo';

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
  // Берём первые 6 районов для сетки 3×2. Пустой список (API недоступен) → секция
  // не рендерится (без пустой «дырки» на главной).
  const districts = (await getDistricts(locale)).slice(0, 6);
  if (districts.length === 0) return null;

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
            <PhotoImg
              src={`https://images.unsplash.com/photo-${COVER_IDS[i % COVER_IDS.length]}?auto=format&fit=crop&w=600&q=60`}
              alt={d.name}
              className="transition-transform duration-[400ms] group-hover:scale-105"
              sizes="(max-width: 640px) 100vw, (max-width: 1280px) 33vw, 25vw"
            />
            {/* Затемнение снизу для читаемости подписи */}
            <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_40%,rgba(26,26,26,0.78))]" />
            <div className="absolute bottom-3.5 left-4 text-white">
              <div className="text-[19px] font-extrabold">{d.name}</div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
