/**
 * privacy.test.ts — инвариант: все локали Политики имеют одинаковые id секций в одном порядке.
 */
import { it, expect } from 'vitest';
import { privacyRu } from './privacy.ru';
import { privacyUz } from './privacy.uz';
import { privacyEn } from './privacy.en';

const EXPECTED_IDS = [
  'general', 'data-collected', 'purposes', 'legal-basis', 'sharing', 'cross-border',
  'cookies', 'retention', 'security', 'rights', 'minors', 'changes', 'contacts',
];

it('ru содержит все ожидаемые секции по порядку', () => {
  expect(privacyRu.sections.map((s) => s.id)).toEqual(EXPECTED_IDS);
});

it('uz и en имеют те же id секций, что и ru', () => {
  const ru = privacyRu.sections.map((s) => s.id);
  expect(privacyUz.sections.map((s) => s.id)).toEqual(ru);
  expect(privacyEn.sections.map((s) => s.id)).toEqual(ru);
});

it('updatedAt совпадает во всех локалях', () => {
  expect(privacyUz.updatedAt).toBe(privacyRu.updatedAt);
  expect(privacyEn.updatedAt).toBe(privacyRu.updatedAt);
});

it('каждая секция непустая', () => {
  for (const doc of [privacyRu, privacyUz, privacyEn]) {
    for (const s of doc.sections) expect(s.blocks.length).toBeGreaterThan(0);
  }
});
