/**
 * Серверный слой юр-документов (спека 2026-07-21). Вызывается ТОЛЬКО из
 * server components /legal/*: тянет опубликованную версию из API (одна локаль
 * по Accept-Language) и конвертирует markdown-подмножество в LegalDoc для
 * существующего рендера LegalDocument. Любая ошибка/404 → null: страница
 * падает на вшитый контент content/legal (fail-safe, как useLegalConsentGate).
 */
import { parseLegalMarkdown } from '@avino/shared';
import type { LegalDoc } from '@/content/legal/types';
import { resolveApiBase } from './base';

/** Контракт GET /api/v1/legal/:kind (snake_case, API.md §legal). */
export interface ApiLegalDoc {
  kind: string;
  version: number;
  title: string;
  body_md: string;
  published_at: string;
}

/** markdown-документ API → модель LegalDoc вшитого рендера. Чистая функция. */
export function toLegalDoc(api: ApiLegalDoc): LegalDoc {
  const { intro, sections } = parseLegalMarkdown(api.body_md);
  return {
    title: api.title,
    updatedAt: api.published_at.slice(0, 10),
    intro,
    sections: sections.map(({ id, heading, blocks }) => ({ id, heading, blocks })),
  };
}

/**
 * Опубликованный документ или null (404 = ещё не публиковали, ошибка = API
 * недоступен) — обе ветки ведут к вшитому фолбэку. Кэш 5 минут.
 */
export async function fetchLegalDoc(
  kind: 'terms' | 'privacy',
  lang: string,
): Promise<ApiLegalDoc | null> {
  try {
    const res = await fetch(`${resolveApiBase()}/legal/${kind}`, {
      next: { revalidate: 300 },
      headers: { Accept: 'application/json', 'Accept-Language': lang },
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`API ${res.status} for /legal/${kind}`);
    return (await res.json()) as ApiLegalDoc;
  } catch (err) {
    console.error('[legal] fetch failed, falling back to baked-in doc', err);
    return null;
  }
}
