/**
 * Markdown-подмножество юр-документов (спека 2026-07-21-admin-legal-documents):
 * `## Заголовок {#anchor}` → секция, `### Подзаголовок` → subheading,
 * `- пункт` → list, прочие строки → абзацы (мягкие переносы склеиваются),
 * текст до первого `##` → intro. Инлайн-разметка НЕ поддерживается —
 * рендер только текстовых нод, инъекции исключены by construction.
 */
export type LegalMdBlock =
  | { type: 'p'; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'subheading'; text: string };

export interface LegalMdSection {
  /** Явный якорь `{#id}`; иначе позиционный `section-N` (1-based). */
  id: string;
  explicitId: boolean;
  heading: string;
  blocks: LegalMdBlock[];
}

export interface ParsedLegalMd {
  intro?: string;
  sections: LegalMdSection[];
}

const SUBHEADING_RE = /^###\s+(.+)$/;
const HEADING_RE = /^##\s+(.+?)(?:\s*\{#([A-Za-z0-9][\w-]*)\})?\s*$/;
const LIST_RE = /^-\s+(.+)$/;

export function parseLegalMarkdown(md: string): ParsedLegalMd {
  const sections: LegalMdSection[] = [];
  const introParas: string[] = [];
  let current: LegalMdSection | null = null;
  let para: string[] = [];
  let list: string[] = [];

  const pushBlock = (block: LegalMdBlock) => {
    if (current) current.blocks.push(block);
    else if (block.type === 'list') introParas.push(...block.items);
    else introParas.push(block.text);
  };
  const flushPara = () => {
    if (para.length) pushBlock({ type: 'p', text: para.join(' ') });
    para = [];
  };
  const flushList = () => {
    if (list.length) pushBlock({ type: 'list', items: list });
    list = [];
  };

  for (const raw of md.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) { flushPara(); flushList(); continue; }
    const sub = SUBHEADING_RE.exec(line);
    if (sub) { flushPara(); flushList(); pushBlock({ type: 'subheading', text: sub[1].trim() }); continue; }
    const head = HEADING_RE.exec(line);
    if (head) {
      flushPara(); flushList();
      current = {
        id: head[2] ?? `section-${sections.length + 1}`,
        explicitId: head[2] != null,
        heading: head[1].trim(),
        blocks: [],
      };
      sections.push(current);
      continue;
    }
    const item = LIST_RE.exec(line);
    if (item) { flushPara(); list.push(item[1].trim()); continue; }
    flushList();
    para.push(line);
  }
  flushPara(); flushList();
  return { intro: introParas.length ? introParas.join(' ') : undefined, sections };
}

/**
 * Предупреждения для админ-предпросмотра: секции без явного `{#id}`
 * (якоря станут позиционными и разъедутся между локалями при разном числе
 * секций) и расхождение наборов якорей между локалями.
 */
export function legalAnchorWarnings(byLocale: { ru: string; uz: string; en: string }): string[] {
  const warnings: string[] = [];
  const locales = ['ru', 'uz', 'en'] as const;
  const parsed = Object.fromEntries(
    locales.map((l) => [l, parseLegalMarkdown(byLocale[l])]),
  ) as Record<(typeof locales)[number], ParsedLegalMd>;
  for (const l of locales) {
    const implicit = parsed[l].sections.filter((s) => !s.explicitId).length;
    if (implicit > 0) {
      warnings.push(`${l}: секций без явного якоря {#id} — ${implicit}, будут позиционные section-N`);
    }
  }
  const key = (p: ParsedLegalMd) => p.sections.map((s) => s.id).join('|');
  if (key(parsed.ru) !== key(parsed.uz) || key(parsed.ru) !== key(parsed.en)) {
    warnings.push('Наборы якорей различаются между локалями — оглавление будет вести на разные секции');
  }
  return warnings;
}
