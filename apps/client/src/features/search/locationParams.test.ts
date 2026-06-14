import { describe, it, expect } from 'vitest';
import { suggestionToLocation } from './locationParams';
import type { Suggestion } from './useGeoSuggest';

describe('suggestionToLocation', () => {
  it('район → district_id (рабочий фильтр), без q-текста', () => {
    const s: Suggestion = {
      kind: 'district',
      title: 'Юнусабадский',
      value: 'Ташкент, Юнусабадский',
      districtId: 'yunusabad-uuid',
    };
    expect(suggestionToLocation(s)).toEqual({
      district_id: 'yunusabad-uuid',
      query: undefined,
    });
  });

  it('гео-место → query-текст (по title), без district_id', () => {
    const s: Suggestion = {
      kind: 'geo',
      title: 'Юнусабад, ул. Амира Темура',
      value: 'Узбекистан, Ташкент, Амира Темура',
    };
    expect(suggestionToLocation(s)).toEqual({
      district_id: undefined,
      query: 'Юнусабад, ул. Амира Темура',
    });
  });
});
