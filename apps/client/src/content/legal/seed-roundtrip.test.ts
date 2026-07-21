/**
 * Пломба сид-контента (спека 2026-07-21-seed-legal-documents): md-файлы
 * apps/api/prisma/legal-content/* после parseLegalMarkdown обязаны давать
 * ровно ту же структуру (intro + sections), что вшитый фолбэк. Гарантия:
 * страница после сида рендерится идентично вшитой.
 *
 * Если тест упал после правки md — это осознанное расхождение сида с
 * фолбэком: либо синхронизируйте TS-фолбэк, либо примите расхождение и
 * обновите тест (см. спеку §4).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseLegalMarkdown } from '@avino/shared';
import { getLegalDoc } from './index';
import type { LegalKind } from './types';
import type { Locale } from '@/i18n/routing';

const CONTENT_DIR = join(__dirname, '..', '..', '..', '..', 'api', 'prisma', 'legal-content');
const KINDS: LegalKind[] = ['terms', 'privacy'];
const LOCALES: Locale[] = ['ru', 'uz', 'en'];

describe('seed legal-content roundtrip', () => {
  for (const kind of KINDS) {
    for (const locale of LOCALES) {
      it(`${kind}.${locale}.md ≡ вшитому LegalDoc`, () => {
        const md = readFileSync(join(CONTENT_DIR, `${kind}.${locale}.md`), 'utf8');
        const parsed = parseLegalMarkdown(md);
        const baked = getLegalDoc(kind, locale);
        expect(parsed.intro).toBe(baked.intro);
        expect(
          parsed.sections.map(({ id, heading, blocks }) => ({ id, heading, blocks })),
        ).toEqual(baked.sections);
        // Все якоря обязаны быть явными — сид не должен зависеть от позиционных section-N.
        expect(parsed.sections.every((s) => s.explicitId)).toBe(true);
      });
    }
  }
});
