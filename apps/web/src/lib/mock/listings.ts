/**
 * Исходные мок-листинги Avino (порт apps/claudeDesign/scripts/data.js).
 * Русский контент, районы Ташкента. Фото — те же Unsplash-плейсхолдеры.
 */
import type { ListingPhoto, PropertyType, SourceListing } from './types';

const u = (id: string, w = 900): string =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&q=70`;

const PHOTOS: Record<string, string[]> = {
  a: ['1560448204-e02f11c3d0e2', '1493809842364-78817add7ffb', '1484154218962-a197022b5858', '1505691938895-1758d7feb511', '1556909114-f6e7ad7d3136'],
  b: ['1554995207-c18c203602cb', '1522708323590-d24dbb6b0267', '1567496898669-ee935f5f647a', '1560185007-cde436f6a4d0', '1502672260266-1c1ef2d93688'],
  c: ['1600585154340-be6161a56a0c', '1600607687939-ce8a6c25118c', '1600566753086-00f18fb6b3ea', '1600210492486-724fe5c67fb0', '1600596542815-ffad4c1539a9'],
  d: ['1570129477492-45c003edd2be', '1580587771525-78b9dba3b914', '1583608205776-bfd35f0d9f83', '1512917774080-9991f1c4c750', '1605276374104-dee2a0ed3cd6'],
};

const setOf = (k: keyof typeof PHOTOS): ListingPhoto[] =>
  PHOTOS[k].map((id) => ({ url: u(id, 1000), thumb: u(id, 320) }));

/** Тёплый плейсхолдер на случай отсутствия фото. */
export const FALLBACK_PHOTO = u('1560185007-cde436f6a4d0', 900);

/** Человекочитаемые названия типов недвижимости. */
export const PROPERTY_TYPES: Record<PropertyType, string> = {
  APARTMENT: 'Квартира',
  HOUSE: 'Дом',
  NEW_BUILDING: 'Новостройка',
  LAND: 'Участок',
  COMMERCIAL: 'Коммерция',
};

const nf = new Intl.NumberFormat('ru-RU');

/** Форматирует цену листинга. `suffix: false` — без «/мес» для аренды. */
export function formatPrice(
  listing: Pick<SourceListing, 'price' | 'currency' | 'tx'>,
  opts: { suffix?: boolean } = {},
): string {
  const n = Number(listing.price);
  const isUSD = listing.currency === 'USD';
  const body = isUSD ? '$' + nf.format(n) : nf.format(n) + ' сум';
  if (opts.suffix === false) return body;
  return listing.tx === 'RENT' ? body + '/мес' : body;
}

export const LISTINGS: SourceListing[] = [
  {
    id: 'av-1001', tx: 'SALE', type: 'APARTMENT', promo: 'VIP',
    price: '1450000000', currency: 'UZS', area: '78', rooms: 3, floor: 8, totalFloors: 10, year: 2022,
    district: 'Юнусабадский', address: 'Юнусабад, 19-квартал, ул. Амира Темура',
    lat: 41.3601, lng: 69.289, photos: setOf('a'),
    title: 'Просторная 3-комнатная в новом доме у метро',
    desc: 'Светлая угловая квартира в сданном ЖК. Качественный ремонт, кухня-гостиная, две лоджии, тёплый пол в ванной. Развитая инфраструктура: метро в 5 минутах, школы, парк Ташкентленд.',
    features: ['Свежий ремонт', 'Кухня-гостиная', '2 лоджии', 'Тёплый пол', 'Парковка во дворе', 'Охрана 24/7'],
    agent: { name: 'Дилноза Каримова', pro: true, agency: 'Avino Pro · Estate Group' },
    created: '2 дня назад',
  },
  {
    id: 'av-1002', tx: 'SALE', type: 'NEW_BUILDING', promo: 'TOP',
    price: '98000', currency: 'USD', area: '64', rooms: 2, floor: 5, totalFloors: 16, year: 2025,
    district: 'Мирзо-Улугбекский', address: 'Мирзо-Улугбек, ЖК «Boulevard», блок C',
    lat: 41.3275, lng: 69.334, photos: setOf('b'),
    title: '2-комнатная в новостройке премиум-класса',
    desc: 'Квартира от застройщика в премиальном комплексе. Панорамные окна, закрытая территория, подземный паркинг, фитнес и коворкинг в доме. Сдача — 4 квартал 2025.',
    features: ['От застройщика', 'Панорамные окна', 'Подземный паркинг', 'Закрытая территория', 'Фитнес в доме', 'Рассрочка'],
    agent: { name: 'Boulevard Development', pro: true, agency: 'Avino Pro · Застройщик' },
    created: '5 часов назад',
  },
  {
    id: 'av-1003', tx: 'SALE', type: 'HOUSE', promo: 'NORMAL',
    price: '2300000000', currency: 'UZS', area: '210', rooms: 5, floor: 1, totalFloors: 2, year: 2019,
    district: 'Мирзо-Улугбекский', address: 'массив Карасу, тихий переулок',
    lat: 41.336, lng: 69.35, photos: setOf('c'),
    title: 'Двухэтажный дом с участком 6 соток',
    desc: 'Капитальный кирпичный дом, 5 комнат, гараж на 2 машины, ухоженный сад, своя скважина. Идеально для большой семьи.',
    features: ['Участок 6 соток', 'Гараж на 2 авто', 'Своя скважина', 'Сад', 'Газ, свет, центр. канализация'],
    agent: { name: 'Рустам Ахмедов', pro: false, agency: 'Частный собственник' },
    created: '1 неделю назад',
  },
  {
    id: 'av-1004', tx: 'RENT', type: 'APARTMENT', promo: 'TOP',
    price: '6500000', currency: 'UZS', area: '55', rooms: 2, floor: 3, totalFloors: 9, year: 2018,
    district: 'Чиланзарский', address: 'Чиланзар, 12-квартал',
    lat: 41.275, lng: 69.203, photos: setOf('a'),
    title: 'Уютная 2-комнатная в аренду надолго',
    desc: 'Меблированная квартира с техникой, всё для комфортного проживания. Рядом метро Чиланзар, базар, школы. Сдаётся на длительный срок, без посредников.',
    features: ['Мебель и техника', 'Кондиционер', 'Стиральная машина', 'Wi-Fi', 'Рядом метро'],
    agent: { name: 'Малика Юсупова', pro: true, agency: 'Avino Pro · Rent Service' },
    created: '3 дня назад',
  },
  {
    id: 'av-1005', tx: 'RENT', type: 'APARTMENT', promo: 'NORMAL',
    price: '450', currency: 'USD', area: '42', rooms: 1, floor: 7, totalFloors: 12, year: 2021,
    district: 'Яккасарайский', address: 'Яккасарай, ул. Шота Руставели',
    lat: 41.289, lng: 69.254, photos: setOf('b'),
    title: 'Студия с дизайнерским ремонтом в центре',
    desc: 'Современная студия в центре города. Стильный ремонт, новая мебель, вид на город с 7 этажа. Близко к ресторанам, паркам и набережной.',
    features: ['Дизайнерский ремонт', 'Новая мебель', 'Вид на город', 'Центр города'],
    agent: { name: 'Camila Estate', pro: true, agency: 'Avino Pro' },
    created: '1 день назад',
  },
  {
    id: 'av-1006', tx: 'SALE', type: 'APARTMENT', promo: 'NORMAL',
    price: '72000', currency: 'USD', area: '58', rooms: 2, floor: 4, totalFloors: 5, year: 2005,
    district: 'Мирабадский', address: 'Мирабад, ул. Нукус',
    lat: 41.299, lng: 69.272, photos: setOf('c'),
    title: '2-комнатная в кирпичном доме, центр',
    desc: 'Квартира в добротном кирпичном доме в престижном районе. Развитая инфраструктура, рядом посольства, парки и хорошие школы.',
    features: ['Кирпичный дом', 'Высокие потолки', 'Раздельный санузел', 'Престижный район'],
    agent: { name: 'Шерзод Набиев', pro: false, agency: 'Частный собственник' },
    created: '4 дня назад',
  },
  {
    id: 'av-1007', tx: 'SALE', type: 'NEW_BUILDING', promo: 'VIP',
    price: '165000', currency: 'USD', area: '95', rooms: 3, floor: 12, totalFloors: 24, year: 2024,
    district: 'Шайхантахурский', address: 'Tashkent City, башня «Nest One»',
    lat: 41.311, lng: 69.238, photos: setOf('b'),
    title: 'Видовая 3-комнатная в Tashkent City',
    desc: 'Премиальная квартира в самом сердце делового центра. Панорама города, сервис уровня отеля, рестораны и магазины на первых этажах, рядом парк.',
    features: ['Tashkent City', 'Панорама города', 'Консьерж-сервис', 'Smart-дом', '2 паркоместа'],
    agent: { name: 'Nest One Sales', pro: true, agency: 'Avino Pro · Застройщик' },
    created: '12 часов назад',
  },
  {
    id: 'av-1008', tx: 'RENT', type: 'HOUSE', promo: 'NORMAL',
    price: '12000000', currency: 'UZS', area: '180', rooms: 4, floor: 1, totalFloors: 2, year: 2016,
    district: 'Сергелийский', address: 'Сергели, массив Янги Хаёт',
    lat: 41.223, lng: 69.22, photos: setOf('d'),
    title: 'Дом в аренду с большим двором',
    desc: 'Просторный дом для семьи, большой двор с зоной отдыха и мангалом. Тихий охраняемый массив, удобный выезд на трассу.',
    features: ['Большой двор', 'Зона барбекю', 'Парковка', 'Охраняемый массив'],
    agent: { name: 'Озода Рахимова', pro: false, agency: 'Частный собственник' },
    created: '6 дней назад',
  },
  {
    id: 'av-1009', tx: 'SALE', type: 'APARTMENT', promo: 'TOP',
    price: '89000', currency: 'USD', area: '70', rooms: 3, floor: 6, totalFloors: 9, year: 2012,
    district: 'Алмазарский', address: 'Алмазар, ул. Фароби',
    lat: 41.345, lng: 69.203, photos: setOf('a'),
    title: '3-комнатная с ремонтом рядом с парком',
    desc: 'Тёплая квартира с качественным ремонтом, готова к заселению. Зелёный двор, рядом парк, рынок и медцентр.',
    features: ['Готова к заселению', 'Зелёный двор', 'Рядом парк', 'Развитая инфраструктура'],
    agent: { name: 'Жасур Тошпулатов', pro: true, agency: 'Avino Pro · City Homes' },
    created: '2 дня назад',
  },
  {
    id: 'av-1010', tx: 'SALE', type: 'COMMERCIAL', promo: 'NORMAL',
    price: '320000', currency: 'USD', area: '140', rooms: null, floor: 1, totalFloors: 1, year: 2020,
    district: 'Юнусабадский', address: 'Юнусабад, проспект Амира Темура',
    lat: 41.352, lng: 69.286, photos: setOf('c'),
    title: 'Коммерческое помещение на первой линии',
    desc: 'Готовый коммерческий объект с отдельным входом и витринными окнами на оживлённом проспекте. Подходит под магазин, кафе или офис.',
    features: ['Первая линия', 'Отдельный вход', 'Витринные окна', 'Высокий трафик'],
    agent: { name: 'Commercial UZ', pro: true, agency: 'Avino Pro' },
    created: '1 неделю назад',
  },
  {
    id: 'av-1011', tx: 'RENT', type: 'APARTMENT', promo: 'NORMAL',
    price: '8000000', currency: 'UZS', area: '62', rooms: 2, floor: 10, totalFloors: 14, year: 2023,
    district: 'Мирзо-Улугбекский', address: 'Мирзо-Улугбек, ЖК «Green Park»',
    lat: 41.33, lng: 69.32, photos: setOf('b'),
    title: 'Новая 2-комнатная с видом на парк',
    desc: 'Светлая квартира в новом ЖК, полностью меблирована. Закрытый двор без машин, детская площадка, рядом школа и торговый центр.',
    features: ['Новый ЖК', 'Меблирована', 'Двор без машин', 'Детская площадка'],
    agent: { name: 'Green Park Rent', pro: true, agency: 'Avino Pro' },
    created: '1 день назад',
  },
  {
    id: 'av-1012', tx: 'SALE', type: 'LAND', promo: 'NORMAL',
    price: '540000000', currency: 'UZS', area: '800', rooms: null, floor: null, totalFloors: null, year: null,
    district: 'Сергелийский', address: 'Сергели, под ИЖС',
    lat: 41.21, lng: 69.235, photos: setOf('d'),
    title: 'Участок 8 соток под строительство',
    desc: 'Ровный участок правильной формы с подведёнными коммуникациями. Все документы готовы, чистая продажа. Хороший район для строительства дома.',
    features: ['8 соток', 'Коммуникации рядом', 'Документы готовы', 'Под ИЖС'],
    agent: { name: 'Бахтиёр Усманов', pro: false, agency: 'Частный собственник' },
    created: '5 дней назад',
  },
];
