/**
 * terms.test.ts — инвариант: все локали Правил имеют одинаковые id секций в одном порядке.
 */
import { it, expect } from 'vitest';
import { termsRu } from './terms.ru';
import { termsUz } from './terms.uz';
import { termsEn } from './terms.en';

const EXPECTED_IDS = [
  'general', 'account', 'listings', 'prohibited', 'promotion', 'chat',
  'content-rights', 'liability', 'ip', 'termination', 'changes', 'law', 'contacts',
];

it('ru содержит все ожидаемые секции по порядку', () => {
  expect(termsRu.sections.map((s) => s.id)).toEqual(EXPECTED_IDS);
});

it('uz и en имеют те же id секций, что и ru', () => {
  const ru = termsRu.sections.map((s) => s.id);
  expect(termsUz.sections.map((s) => s.id)).toEqual(ru);
  expect(termsEn.sections.map((s) => s.id)).toEqual(ru);
});

it('updatedAt совпадает во всех локалях', () => {
  expect(termsUz.updatedAt).toBe(termsRu.updatedAt);
  expect(termsEn.updatedAt).toBe(termsRu.updatedAt);
});

it('каждая секция непустая', () => {
  for (const doc of [termsRu, termsUz, termsEn]) {
    for (const s of doc.sections) expect(s.blocks.length).toBeGreaterThan(0);
  }
});
