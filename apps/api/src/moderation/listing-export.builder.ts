import { Workbook } from 'exceljs';
import {
  Currency,
  ListingStatus,
  PropertyType,
  TransactionType,
} from '@prisma/client';

/**
 * Потолок строк в одной выгрузке: файл собирается в памяти, поэтому без лимита
 * нельзя. Попадают самые свежие объявления (сортировка списка).
 */
export const EXPORT_MAX_ROWS = 5000;

/** Плоская строка выгрузки — всё, что нужно файлу, без HTTP/Prisma-типов. */
export interface ListingExportRow {
  reference: number;
  title: string;
  address: string | null;
  transactionType: TransactionType;
  propertyType: PropertyType;
  price: number;
  currency: Currency;
  rooms: number | null;
  area: number | null;
  districtName: string | null;
  ownerName: string | null;
  ownerPhone: string | null;
  ownerEmail: string | null;
  status: ListingStatus;
  viewsCount: number;
  createdAt: Date;
  publishedAt: Date | null;
}

/** Подписи статусов — те же, что в фильтрах и pill-ах админки. */
const STATUS_LABEL: Record<ListingStatus, string> = {
  [ListingStatus.NEW]: 'На проверке',
  [ListingStatus.ACTIVE]: 'Опубликовано',
  [ListingStatus.DRAFT]: 'Черновик',
  [ListingStatus.REJECTED]: 'Отклонено',
  [ListingStatus.DELETED]: 'Удалено',
  [ListingStatus.ARCHIVED]: 'Архив',
  [ListingStatus.SOLD]: 'Продано',
  [ListingStatus.RENTED]: 'Сдано',
};

/** Подписи сделки и типа — те же слова, что принимает импорт (import-columns). */
const TRANSACTION_LABEL: Record<TransactionType, string> = {
  [TransactionType.SALE]: 'Продажа',
  [TransactionType.RENT]: 'Аренда',
};

const PROPERTY_LABEL: Record<PropertyType, string> = {
  [PropertyType.APARTMENT]: 'Квартира',
  [PropertyType.HOUSE]: 'Дом',
  [PropertyType.LAND]: 'Участок',
  [PropertyType.COMMERCIAL]: 'Коммерция',
};

/** Ташкент — UTC+5 круглый год (перехода на летнее время нет). */
const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;

/**
 * Excel не знает часовых поясов и показывает дату «как записана». Сдвигаем
 * момент на UTC+5, чтобы в ячейке было локальное время Ташкента.
 */
function tashkentTime(date: Date | null): Date | null {
  return date ? new Date(date.getTime() + TASHKENT_OFFSET_MS) : null;
}

const DATE_FORMAT = 'dd.mm.yyyy hh:mm';

type CellValue = string | number | Date | null;

interface ExportColumn {
  header: string;
  width: number;
  numFmt?: string;
  value: (row: ListingExportRow) => CellValue;
}

/** Реестр колонок выгрузки: порядок здесь = порядок в файле. */
export const EXPORT_COLUMNS: readonly ExportColumn[] = [
  { header: '№', width: 10, value: (r) => r.reference },
  { header: 'Заголовок', width: 40, value: (r) => r.title },
  { header: 'Адрес', width: 40, value: (r) => r.address },
  { header: 'Тип сделки', width: 12, value: (r) => TRANSACTION_LABEL[r.transactionType] },
  { header: 'Тип недвижимости', width: 18, value: (r) => PROPERTY_LABEL[r.propertyType] },
  { header: 'Цена', width: 16, numFmt: '#,##0.##', value: (r) => r.price },
  { header: 'Валюта', width: 9, value: (r) => r.currency },
  { header: 'Комнат', width: 9, value: (r) => r.rooms },
  { header: 'Площадь', width: 10, value: (r) => r.area },
  { header: 'Район', width: 24, value: (r) => r.districtName },
  { header: 'Автор', width: 24, value: (r) => r.ownerName },
  // Телефон — текстом, чтобы Excel не превращал номер в число.
  { header: 'Телефон', width: 16, numFmt: '@', value: (r) => r.ownerPhone },
  { header: 'Email', width: 26, value: (r) => r.ownerEmail },
  { header: 'Статус', width: 14, value: (r) => STATUS_LABEL[r.status] },
  { header: 'Просмотры', width: 11, value: (r) => r.viewsCount },
  { header: 'Создано', width: 17, numFmt: DATE_FORMAT, value: (r) => tashkentTime(r.createdAt) },
  { header: 'Опубликовано', width: 17, numFmt: DATE_FORMAT, value: (r) => tashkentTime(r.publishedAt) },
];

/**
 * Файл выгрузки админ-списка объявлений (`.xlsx`): одна строка — одно
 * объявление. Значения пишутся типизированными ячейками (строка остаётся
 * строкой), поэтому текст вида `=1+1` формулой не становится.
 */
export async function buildListingExport(rows: ListingExportRow[]): Promise<Buffer> {
  const workbook = new Workbook();
  const sheet = workbook.addWorksheet('Объявления');
  sheet.columns = EXPORT_COLUMNS.map((column) => ({
    header: column.header,
    width: column.width,
    style: column.numFmt ? { numFmt: column.numFmt } : {},
  }));
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  for (const row of rows) {
    sheet.addRow(EXPORT_COLUMNS.map((column) => column.value(row)));
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
