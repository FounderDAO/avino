import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchLegalDoc, toLegalDoc } from './legal';

const API_DOC = {
  kind: 'terms', version: 3, title: 'Правила сервиса',
  body_md: 'Интро.\n\n## Общие {#general}\nТекст.',
  published_at: '2026-07-20T10:30:00.000Z',
};

describe('toLegalDoc', () => {
  it('markdown → LegalDoc: title, дата из published_at, intro и секции', () => {
    expect(toLegalDoc(API_DOC)).toMatchObject({
      title: 'Правила сервиса',
      updatedAt: '2026-07-20',
      intro: 'Интро.',
      sections: [
        { id: 'general', heading: 'Общие', blocks: [{ type: 'p', text: 'Текст.' }] },
      ],
    });
  });
});

describe('fetchLegalDoc', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('200 → документ', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(API_DOC), { status: 200 })));
    expect(await fetchLegalDoc('terms', 'ru')).toEqual(API_DOC);
  });

  it('404 (нет публикаций) → null без шума', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })));
    expect(await fetchLegalDoc('terms', 'ru')).toBeNull();
  });

  it('сеть упала → null (фолбэк на вшитый текст)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED'); }));
    expect(await fetchLegalDoc('privacy', 'uz')).toBeNull();
  });
});
