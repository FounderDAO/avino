import { ValidationPipe } from '@nestjs/common';
import { validationPipeOptions } from '../../common/validation/validation.options';
import {
  EXPORT_MAX_IDS,
  ExportAdminListingsQueryDto,
} from './export-admin-listings.dto';

const ID_A = '3f2b8c1e-4a5d-4e6f-8a9b-0c1d2e3f4a5b';
const ID_B = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

/** Гоняем настоящий глобальный ValidationPipe (с enableImplicitConversion). */
describe('ExportAdminListingsQueryDto', () => {
  const pipe = new ValidationPipe(validationPipeOptions);
  const parse = (input: Record<string, unknown>): Promise<ExportAdminListingsQueryDto> =>
    pipe.transform(input, { type: 'query', metatype: ExportAdminListingsQueryDto });

  it('ids через запятую → массив', async () => {
    expect((await parse({ ids: `${ID_A},${ID_B}` })).ids).toEqual([ID_A, ID_B]);
  });

  it('один id и повторяющийся параметр → массив', async () => {
    expect((await parse({ ids: ID_A })).ids).toEqual([ID_A]);
    expect((await parse({ ids: [ID_A, ID_B] })).ids).toEqual([ID_A, ID_B]);
  });

  it('параметр не передан → undefined, фильтры списка работают', async () => {
    const dto = await parse({ status: 'ACTIVE' });

    expect(dto.ids).toBeUndefined();
    expect(dto.status).toBe('ACTIVE');
  });

  it('не-UUID → 400', async () => {
    await expect(parse({ ids: `${ID_A},not-a-uuid` })).rejects.toMatchObject({ status: 400 });
  });

  it(`больше ${EXPORT_MAX_IDS} id → 400`, async () => {
    const ids = Array.from({ length: EXPORT_MAX_IDS + 1 }, () => ID_A).join(',');

    await expect(parse({ ids })).rejects.toMatchObject({ status: 400 });
  });
});
