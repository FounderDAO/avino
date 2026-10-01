import { ValidationPipe } from '@nestjs/common';
import { validationPipeOptions } from '../../common/validation/validation.options';
import { RunListingImportQueryDto } from './run-listing-import.dto';

/** Гоняем настоящий глобальный ValidationPipe (с enableImplicitConversion). */
describe('RunListingImportQueryDto', () => {
  const pipe = new ValidationPipe(validationPipeOptions);
  const parse = (input: Record<string, unknown>): Promise<RunListingImportQueryDto> =>
    pipe.transform(input, { type: 'query', metatype: RunListingImportQueryDto });

  it("'true' → true", async () => {
    expect((await parse({ dry_run: 'true' })).dry_run).toBe(true);
  });

  it("'false' → false (не true из-за неявного Boolean('false'))", async () => {
    expect((await parse({ dry_run: 'false' })).dry_run).toBe(false);
  });

  it('параметр не передан → undefined', async () => {
    expect((await parse({})).dry_run).toBeUndefined();
  });

  it.each(['abc', '1'])("'%s' → 400", async (value) => {
    await expect(parse({ dry_run: value })).rejects.toMatchObject({ status: 400 });
  });
});
