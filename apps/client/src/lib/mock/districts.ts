/**
 * Районы Ташкента (порт массива districts из data.js).
 * Счётчик объявлений вычисляется по мок-листингам в index.ts.
 *
 * `aliases` — узбекские/латинские написания района для матчинга подсказок,
 * чтобы поиск на латинице («yunusobod», «chilonzor») находил район. Подпись в
 * UI остаётся каноничной (RU `name`).
 */
export interface DistrictRef {
  name: string;
  aliases: string[];
}

export const DISTRICTS: DistrictRef[] = [
  { name: 'Юнусабадский', aliases: ['Yunusobod', 'Yunusabad', 'Yunusabadskiy'] },
  { name: 'Мирзо-Улугбекский', aliases: ["Mirzo Ulug'bek", 'Mirzo Ulugbek', 'Mirzo-Ulugbekskiy', 'Ulugbek'] },
  { name: 'Чиланзарский', aliases: ['Chilonzor', 'Chilanzar', 'Chilanzarskiy'] },
  { name: 'Яккасарайский', aliases: ['Yakkasaroy', 'Yakkasaray', 'Yakkasarayskiy'] },
  { name: 'Мирабадский', aliases: ['Mirobod', 'Mirabad', 'Mirabadskiy'] },
  { name: 'Шайхантахурский', aliases: ['Shayxontohur', 'Shaykhantakhur', 'Shayhantohur', 'Shaykhantahurskiy'] },
  { name: 'Сергелийский', aliases: ['Sergeli', 'Sergeliyskiy'] },
  { name: 'Алмазарский', aliases: ['Olmazor', 'Almazar', 'Almazarskiy'] },
];

/** Имена районов (RU) — производное от {@link DISTRICTS}. */
export const DISTRICT_NAMES: string[] = DISTRICTS.map((d) => d.name);
