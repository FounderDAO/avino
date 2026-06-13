import { describe, it, expect } from 'vitest';
import { mapDistrict, type ApiDistrict } from './geo';

const SAMPLE: ApiDistrict = {
  id: 'd-1',
  code: 'YUN',
  name_uz: 'Yunusobod',
  name_ru: 'Юнусабадский',
  name_en: 'Yunusabad',
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
    const dupe: ApiDistrict = { id: 'd-2', code: 'X', name_uz: 'Sergeli', name_ru: 'Sergeli', name_en: '' };
    const d = mapDistrict(dupe, 'uz');
    expect(d.id).toBe('d-2');
    expect(d.name).toBe('Sergeli');
    // Пустые и дубликаты выкинуты.
    expect(d.aliases).toEqual([]);
  });
});
