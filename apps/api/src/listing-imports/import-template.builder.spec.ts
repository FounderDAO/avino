import { HttpException } from '@nestjs/common';
import { Workbook } from 'exceljs';
import { IMPORT_COLUMNS } from './import-columns';
import { parseImportFile } from './import-file.parser';
import { buildImportTemplate } from './import-template.builder';

describe('buildImportTemplate', () => {
  it('первый лист — только заголовки всех колонок реестра; есть лист «Справка»', async () => {
    const buffer = await buildImportTemplate();
    const workbook = new Workbook();
    await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    const [sheet, help] = workbook.worksheets;
    expect((sheet.getRow(1).values as unknown[]).slice(1)).toEqual(
      IMPORT_COLUMNS.map((column) => column.label),
    );
    expect(sheet.rowCount).toBe(1);
    expect(help.name).toBe('Справка');
  });

  it('пустой шаблон парсер считает файлом без данных, а не файлом без колонок', async () => {
    const buffer = await buildImportTemplate();
    let code: string | undefined;
    try {
      await parseImportFile({ buffer, originalname: 'template.xlsx', size: buffer.length });
    } catch (error) {
      code = ((error as HttpException).getResponse() as { code: string }).code;
    }
    expect(code).toBe('IMPORT_FILE_EMPTY');
  });
});
