import { Workbook } from 'exceljs';
import { IMPORT_COLUMNS, ImportColumnKey, IMPORT_MAX_ROWS } from './import-columns';

/** Пояснения для листа «Справка»: обязательность, допустимые значения, пример. */
const HELP: Record<ImportColumnKey, [required: string, hint: string, example: string]> = {
  phone: ['да', 'Телефон владельца: +998901234567, 998901234567 или 90 123 45 67', '+998901234567'],
  first_name: ['если владелец новый', 'Используется, только когда в профиле владельца имя пустое', 'Али'],
  last_name: ['если владелец новый', 'Используется, только когда в профиле владельца фамилия пустая', 'Валиев'],
  transaction_type: ['да', 'Продажа / Аренда (или SALE / RENT)', 'Продажа'],
  property_type: ['да', 'Квартира / Дом / Участок / Коммерция (или APARTMENT / HOUSE / LAND / COMMERCIAL)', 'Квартира'],
  title: ['да', 'До 255 символов', '2-комнатная квартира на Навои'],
  description: ['нет', 'Текст объявления на одном языке', 'Светлая квартира после ремонта'],
  language: ['нет', 'RU / UZ / EN, по умолчанию RU', 'RU'],
  price: ['да', 'Число, до 2 знаков после запятой', '85000'],
  currency: ['да', 'UZS / USD', 'USD'],
  address: ['да', 'До 500 символов. Входит в проверку «уже существует»', 'Ташкент, ул. Навои, 12'],
  area: ['да, кроме участка', 'м². Входит в проверку «уже существует»', '55'],
  lot_area: ['для участка', 'Площадь участка, м²', '600'],
  floor: ['нет', 'Целое число. Входит в проверку «уже существует»', '3'],
  total_floors: ['нет', 'Целое число', '9'],
  rooms: ['нет', 'Целое число', '2'],
  bathrooms: ['нет', 'Шаг 0.5: 1, 1.5, 2', '1'],
  year_built: ['для квартиры и дома', 'Год, целое число', '2015'],
  parking_type: ['нет', 'YARD / COVERED / GARAGE / UNDERGROUND', 'YARD'],
  latitude: ['нет', 'Только вместе с долготой', '41.311081'],
  longitude: ['нет', 'Только вместе с широтой', '69.240562'],
  amenities: ['нет', 'Коды удобств из справочника через запятую', 'wifi, conditioner'],
};

/**
 * Шаблон импорта (спека 2026-10-02 §5). Строится из реестра колонок — шаблон и
 * парсер не могут разойтись. Лист 1 — только заголовки (пример туда не кладём:
 * забытая строка-пример создала бы объявление), лист «Справка» — пояснения.
 */
export async function buildImportTemplate(): Promise<Buffer> {
  const workbook = new Workbook();
  const sheet = workbook.addWorksheet('Импорт');
  sheet.addRow(IMPORT_COLUMNS.map((column) => column.label));
  sheet.getRow(1).font = { bold: true };
  sheet.columns.forEach((column) => {
    column.width = 22;
  });
  // Телефон — текстовая колонка, чтобы Excel не превращал номер в число.
  sheet.getColumn(1).numFmt = '@';

  const help = workbook.addWorksheet('Справка');
  help.addRow(['Колонка', 'Обязательна', 'Правило', 'Пример']);
  help.getRow(1).font = { bold: true };
  for (const column of IMPORT_COLUMNS) {
    help.addRow([column.label, ...HELP[column.key]]);
  }
  help.addRow([]);
  help.addRow([`Одна строка = одно объявление. Не больше ${IMPORT_MAX_ROWS} строк в файле.`]);
  help.columns = [{ width: 22 }, { width: 22 }, { width: 70 }, { width: 34 }];

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
