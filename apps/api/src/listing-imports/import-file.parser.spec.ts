import { HttpException } from '@nestjs/common';
import { Workbook } from 'exceljs';
import { ImportUploadedFile, parseImportFile } from './import-file.parser';

const HEADERS = ['Телефон', 'Тип сделки', 'Тип недвижимости', 'Заголовок', 'Цена', 'Валюта', 'Адрес', 'Площадь'];
const ROW = [998901234567, 'Продажа', 'Квартира', 'Квартира на Навои', 85000.5, 'USD', 'Ташкент, Навои 12', 55];

async function xlsx(rows: unknown[][], name = 'listings.xlsx'): Promise<ImportUploadedFile> {
  const workbook = new Workbook();
  const sheet = workbook.addWorksheet('Импорт');
  rows.forEach((row) => sheet.addRow(row));
  workbook.addWorksheet('Справка').addRow(['игнорируется']);
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  return { buffer, originalname: name, size: buffer.length };
}

function csv(text: string, name = 'listings.csv'): ImportUploadedFile {
  const buffer = Buffer.from(text, 'utf8');
  return { buffer, originalname: name, size: buffer.length };
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return ((error as HttpException).getResponse() as { code: string }).code;
  }
  throw new Error('expected rejection');
}

describe('parseImportFile', () => {
  it('читает xlsx: первый лист, номера строк, числовые ячейки → строки', async () => {
    const parsed = await parseImportFile(await xlsx([HEADERS, ROW]));
    expect(parsed.unknownColumns).toEqual([]);
    expect(parsed.rows).toEqual([
      {
        rowNumber: 2,
        values: {
          phone: '998901234567',
          transaction_type: 'Продажа',
          property_type: 'Квартира',
          title: 'Квартира на Навои',
          price: '85000.5',
          currency: 'USD',
          address: 'Ташкент, Навои 12',
          area: '55',
        },
      },
    ]);
  });

  it('пропускает пустые строки и строки из пробелов, сохраняя номера', async () => {
    const parsed = await parseImportFile(
      await xlsx([HEADERS, ROW, [], ['  ', null, ''], ROW]),
    );
    expect(parsed.rows.map((r) => r.rowNumber)).toEqual([2, 5]);
  });

  it('заголовки — по ключу или подписи, без учёта регистра; неизвестные возвращаются', async () => {
    const headers = ['PHONE', ' тип сделки ', 'property_type', 'Заголовок', 'Цена', 'Валюта', 'Адрес', 'Коментарий'];
    const parsed = await parseImportFile(await xlsx([headers, ROW]));
    expect(parsed.unknownColumns).toEqual(['Коментарий']);
    expect(parsed.rows[0].values.phone).toBe('998901234567');
    expect(parsed.rows[0].values.transaction_type).toBe('Продажа');
  });

  it('читает csv с запятой, BOM', async () => {
    const text = `\uFEFF${HEADERS.join(',')}\n+998901234567,Продажа,Квартира,"Квартира, центр",85000,USD,"Ташкент, Навои 12",55\n`;
    const parsed = await parseImportFile(csv(text));
    expect(parsed.rows[0].values.title).toBe('Квартира, центр');
    expect(parsed.rows[0].values.phone).toBe('+998901234567');
  });

  it('читает csv с точкой с запятой', async () => {
    const text = `${HEADERS.join(';')}\n998901234567;Продажа;Квартира;Квартира;85000,50;USD;Ташкент, Навои 12;55\n`;
    const parsed = await parseImportFile(csv(text));
    expect(parsed.rows[0].values.price).toBe('85000,50');
    expect(parsed.rows[0].values.address).toBe('Ташкент, Навои 12');
  });

  it('ошибки файла', async () => {
    expect(await codeOf(parseImportFile(undefined))).toBe('IMPORT_FILE_REQUIRED');
    expect(await codeOf(parseImportFile(csv('x', 'a.pdf')))).toBe('IMPORT_FILE_UNSUPPORTED');
    expect(
      await codeOf(parseImportFile({ buffer: Buffer.from('zzz'), originalname: 'a.xlsx', size: 3 })),
    ).toBe('IMPORT_FILE_UNSUPPORTED');
    expect(
      await codeOf(
        parseImportFile({ buffer: Buffer.alloc(1), originalname: 'a.csv', size: 2 * 1024 * 1024 + 1 }),
      ),
    ).toBe('IMPORT_FILE_TOO_LARGE');
    expect(await codeOf(parseImportFile(await xlsx([HEADERS])))).toBe('IMPORT_FILE_EMPTY');
    expect(
      await codeOf(parseImportFile(await xlsx([HEADERS, ...Array(501).fill(ROW)]))),
    ).toBe('IMPORT_TOO_MANY_ROWS');
  });

  it('нет обязательной колонки → IMPORT_MISSING_COLUMNS с details', async () => {
    try {
      await parseImportFile(await xlsx([['Телефон', 'Цена'], [1, 2]]));
      throw new Error('expected rejection');
    } catch (error) {
      const body = (error as HttpException).getResponse() as {
        code: string;
        details: { field: string }[];
      };
      expect(body.code).toBe('IMPORT_MISSING_COLUMNS');
      expect(body.details.map((d) => d.field)).toEqual([
        'transaction_type',
        'property_type',
        'title',
        'currency',
        'address',
      ]);
    }
  });
});
