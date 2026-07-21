/**
 * Одноразовый экспорт вшитых юр-документов в markdown-подмножество ADR-0149
 * для сида legal_documents (спека 2026-07-21-seed-legal-documents).
 * Источник правды после первого прогона — сгенерированные md, не эти TS.
 *
 * Запуск из apps/client: pnpm dlx tsx scripts/export-legal-markdown.ts
 * Импорты ТОЛЬКО относительные (index.ts тянет алиас @/i18n — сломает tsx).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { LegalBlock, LegalDoc } from '../src/content/legal/types';
import { termsRu } from '../src/content/legal/terms.ru';
import { termsUz } from '../src/content/legal/terms.uz';
import { termsEn } from '../src/content/legal/terms.en';
import { privacyRu } from '../src/content/legal/privacy.ru';
import { privacyUz } from '../src/content/legal/privacy.uz';
import { privacyEn } from '../src/content/legal/privacy.en';

const OUT_DIR = join(__dirname, '..', '..', 'api', 'prisma', 'legal-content');

function blockToMd(block: LegalBlock): string {
  switch (block.type) {
    case 'p':
      return block.text;
    case 'subheading':
      return `### ${block.text}`;
    case 'list':
      return block.items.map((item) => `- ${item}`).join('\n');
  }
}

/** LegalDoc → markdown-подмножество ADR-0149 (обратная операция к parseLegalMarkdown). */
function docToMarkdown(doc: LegalDoc): string {
  const parts: string[] = [];
  if (doc.intro) parts.push(doc.intro);
  for (const section of doc.sections) {
    parts.push(`## ${section.heading} {#${section.id}}`);
    for (const block of section.blocks) parts.push(blockToMd(block));
  }
  return parts.join('\n\n') + '\n';
}

const DOCS: Record<string, LegalDoc> = {
  'terms.ru': termsRu,
  'terms.uz': termsUz,
  'terms.en': termsEn,
  'privacy.ru': privacyRu,
  'privacy.uz': privacyUz,
  'privacy.en': privacyEn,
};

mkdirSync(OUT_DIR, { recursive: true });
for (const [name, doc] of Object.entries(DOCS)) {
  const file = join(OUT_DIR, `${name}.md`);
  writeFileSync(file, docToMarkdown(doc), 'utf8');
  console.log(`wrote ${file} (${doc.sections.length} sections)`);
}
