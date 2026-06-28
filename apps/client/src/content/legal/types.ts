/**
 * Модель юридического документа (Правила/Политика).
 * Тело хранится отдельными per-locale модулями (см. content/legal/*.{ru,uz,en}.ts),
 * чтобы длинный текст не попадал в глобальный i18n-бандл.
 */
export type LegalBlock =
  | { type: 'p'; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'subheading'; text: string };

export interface LegalSection {
  /** Стабильный slug-якорь, ОДИНАКОВЫЙ для всех языков документа. */
  id: string;
  heading: string;
  blocks: LegalBlock[];
}

export interface LegalDoc {
  title: string;
  /** ISO-дата (YYYY-MM-DD), одна для всех языков документа. */
  updatedAt: string;
  intro?: string;
  sections: LegalSection[];
}

export type LegalKind = 'terms' | 'privacy';
