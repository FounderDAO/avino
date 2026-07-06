import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  BoundsSearchQueryDto,
  PolygonSearchQueryDto,
} from './geo-search.dto';

function dto<T extends object>(cls: new () => T, obj: Record<string, unknown>) {
  const inst = plainToInstance(cls, obj, { enableImplicitConversion: true });
  return { inst, errors: validateSync(inst) };
}

/**
 * Регресс на TASK-249 (ADR-0133): необязательный `points` был добавлен в
 * БАЗОВЫЙ `SearchListingsQueryDto` (для `/search`/`/search/bounds`), а
 * `PolygonSearchQueryDto.points` остаётся ОБЯЗАТЕЛЬНЫМ (`/search/polygon`,
 * TASK-193) — свой собственный `@IsPolygonRing()`, БЕЗ `@IsOptional()`.
 *
 * class-validator наследует validation-метаданные между базовым и производным
 * классом ПО ИМЕНИ СВОЙСТВА (см. комментарий у `IsPolygonRingOptional` в
 * `polygon-ring.util.ts`): если бы базовый `points` использовал
 * `@IsOptional()`/`@ValidateIf()`, это условие унаследовалось бы в
 * `PolygonSearchQueryDto` и молча сделало бы обязательный контур
 * необязательным. Этот тест ловит именно такую регрессию.
 */
describe('PolygonSearchQueryDto.points остаётся обязательным несмотря на опциональный points в базовом DTO (TASK-249)', () => {
  it('отклоняет запрос без points (400, не пропускает как опциональный)', () => {
    const { errors } = dto(PolygonSearchQueryDto, {});
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.property === 'points')).toBe(true);
  });

  it('принимает валидный points', () => {
    const { errors } = dto(PolygonSearchQueryDto, {
      points: '41.30,69.27;41.30,69.29;41.32,69.28',
    });
    expect(errors).toHaveLength(0);
  });

  it('отклоняет невалидный points (< 3 вершин) так же, как раньше', () => {
    const { errors } = dto(PolygonSearchQueryDto, {
      points: '41.30,69.27;41.30,69.29',
    });
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe('BoundsSearchQueryDto.points — унаследованный опциональный контур (TASK-249)', () => {
  it('bbox без points — валиден (points опционален)', () => {
    const { errors } = dto(BoundsSearchQueryDto, {
      sw_lat: 41.2,
      sw_lng: 69.1,
      ne_lat: 41.4,
      ne_lng: 69.4,
    });
    expect(errors).toHaveLength(0);
  });

  it('bbox + валидный points — валиден', () => {
    const { errors } = dto(BoundsSearchQueryDto, {
      sw_lat: 41.2,
      sw_lng: 69.1,
      ne_lat: 41.4,
      ne_lng: 69.4,
      points: '41.30,69.27;41.30,69.29;41.32,69.28',
    });
    expect(errors).toHaveLength(0);
  });

  it('bbox + невалидный points — 400', () => {
    const { errors } = dto(BoundsSearchQueryDto, {
      sw_lat: 41.2,
      sw_lng: 69.1,
      ne_lat: 41.4,
      ne_lng: 69.4,
      points: '41.30,69.27',
    });
    expect(errors.length).toBeGreaterThan(0);
  });
});
