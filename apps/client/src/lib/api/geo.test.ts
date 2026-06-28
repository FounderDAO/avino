import { describe, it, expect } from 'vitest';
import { mapDistrict, mapRegion, type ApiDistrict, type ApiRegion } from './geo';

const SAMPLE: ApiDistrict = {
  id: 'd-1',
  code: 'YUN',
  name_uz: 'Yunusobod',
  name_ru: 'Юнусабадский',
  name_en: 'Yunusabad',
  region_id: 'c11',
};

const SAMPLE_REGION: ApiRegion = {
  id: 'c11',
  code: 'TASHKENT',
  name_uz: 'Toshkent',
  name_ru: 'Ташкент',
  name_en: 'Tashkent',
};

describe('mapDistrict', () => {
  it('выбирает имя по языку (ru/uz/en) с фолбэком на name_ru', () => {
    expect(mapDistrict(SAMPLE, 'ru').name).toBe('Юнусабадский');
    expect(mapDistrict(SAMPLE, 'uz').name).toBe('Yunusobod');
    expect(mapDistrict(SAMPLE, 'en').name).toBe('Yunusabad');
    // Региональные/неизвестные теги и пустой язык → name_ru.
    expect(mapDistrict(SAMPLE, 'ru-RU').name).toBe('Юнусабадский');
    expect(mapDistrict(SAMPLE, '').name).toBe('Юнусабадский');
  });

  it('кладёт имена на других языках в aliases (для матчинга на латинице)', () => {
    const d = mapDistrict(SAMPLE, 'ru');
    expect(d.aliases).toEqual(expect.arrayContaining(['Yunusobod', 'Yunusabad']));
    // Отображаемое имя не дублируется в алиасах.
    expect(d.aliases).not.toContain('Юнусабадский');
  });

  it('сохраняет id и не падает на дублирующихся/пустых именах', () => {
    const dupe: ApiDistrict = { id: 'd-2', code: 'X', name_uz: 'Sergeli', name_ru: 'Sergeli', name_en: '', region_id: null };
    const d = mapDistrict(dupe, 'uz');
    expect(d.id).toBe('d-2');
    expect(d.name).toBe('Sergeli');
    // Пустые и дубликаты выкинуты.
    expect(d.aliases).toEqual([]);
  });

  it('проставляет regionId из region_id; null → undefined', () => {
    expect(mapDistrict(SAMPLE, 'ru').regionId).toBe('c11');
    const noRegion: ApiDistrict = { ...SAMPLE, region_id: null };
    expect(mapDistrict(noRegion, 'ru').regionId).toBeUndefined();
  });
});

describe('mapRegion', () => {
  it('выбирает имя по языку (uz/en/ru) с фолбэком на name_ru', () => {
    expect(mapRegion(SAMPLE_REGION, 'ru').name).toBe('Ташкент');
    expect(mapRegion(SAMPLE_REGION, 'uz').name).toBe('Toshkent');
    expect(mapRegion(SAMPLE_REGION, 'en').name).toBe('Tashkent');
    expect(mapRegion(SAMPLE_REGION, 'ru-RU').name).toBe('Ташкент');
    expect(mapRegion(SAMPLE_REGION).name).toBe('Ташкент'); // дефолт ru
  });

  it('сохраняет id и code', () => {
    const r = mapRegion(SAMPLE_REGION, 'ru');
    expect(r.id).toBe('c11');
    expect(r.code).toBe('TASHKENT');
  });
});
