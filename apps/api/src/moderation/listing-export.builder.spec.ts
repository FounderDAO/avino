import { Workbook } from 'exceljs';
import {
  Currency,
  ListingStatus,
  PropertyType,
  TransactionType,
} from '@prisma/client';
import {
  buildListingExport,
  EXPORT_COLUMNS,
  ListingExportRow,
} from './listing-export.builder';

const ROW: ListingExportRow = {
  reference: 100042,
  title: '2-комн квартира',
  address: 'Ташкент, ул. Навои, 12',
  transactionType: TransactionType.RENT,
  propertyType: PropertyType.APARTMENT,
  price: 4500000,
  currency: Currency.UZS,
  rooms: 2,
  area: 55.5,
  districtName: 'Чиланзарский район',
  ownerName: 'Алишер У.',
  ownerPhone: '+998901234567',
  ownerEmail: 'seller@example.com',
  status: ListingStatus.NEW,
  viewsCount: 7,
  createdAt: new Date('2026-06-02T08:00:00.000Z'),
  publishedAt: null,
};

async function load(rows: ListingExportRow[]) {
  const buffer = await buildListingExport(rows);
  const workbook = new Workbook();
  await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  return workbook.worksheets[0];
}

const cells = (values: unknown): unknown[] => (values as unknown[]).slice(1);

describe('buildListingExport', () => {
  it('первая строка — заголовки колонок; без объявлений файл всё равно валиден', async () => {
    const sheet = await load([]);
    expect(cells(sheet.getRow(1).values)).toEqual(EXPORT_COLUMNS.map((c) => c.header));
    expect(sheet.rowCount).toBe(1);
  });

  it('строка объявления: подписи по-русски, числа — числами, даты — по Ташкенту', async () => {
    const sheet = await load([ROW]);
    const row = sheet.getRow(2);
    expect(row.getCell(1).value).toBe(100042);
    expect(row.getCell(2).value).toBe('2-комн квартира');
    expect(row.getCell(3).value).toBe('Ташкент, ул. Навои, 12');
    expect(row.getCell(4).value).toBe('Аренда');
    expect(row.getCell(5).value).toBe('Квартира');
    expect(row.getCell(6).value).toBe(4500000);
    expect(row.getCell(7).value).toBe('UZS');
    expect(row.getCell(8).value).toBe(2);
    expect(row.getCell(9).value).toBe(55.5);
    expect(row.getCell(10).value).toBe('Чиланзарский район');
    expect(row.getCell(11).value).toBe('Алишер У.');
    expect(row.getCell(12).value).toBe('+998901234567');
    expect(row.getCell(13).value).toBe('seller@example.com');
    expect(row.getCell(14).value).toBe('На проверке');
    expect(row.getCell(15).value).toBe(7);
    // 08:00 UTC → 13:00 по Ташкенту (UTC+5).
    expect(row.getCell(16).value).toEqual(new Date('2026-06-02T13:00:00.000Z'));
    expect(row.getCell(17).value).toBeNull();
  });

  it('текст, похожий на формулу, остаётся строкой, а не формулой', async () => {
    const sheet = await load([{ ...ROW, title: '=1+1', address: null }]);
    const row = sheet.getRow(2);
    expect(row.getCell(2).value).toBe('=1+1');
    expect(row.getCell(2).formula).toBeUndefined();
    expect(row.getCell(3).value).toBeNull();
  });
});
