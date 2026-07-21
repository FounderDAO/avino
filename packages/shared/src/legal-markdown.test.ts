import { describe, expect, it } from 'vitest';
import { legalAnchorWarnings, parseLegalMarkdown } from './legal-markdown';

describe('parseLegalMarkdown', () => {
  it('разбирает интро, секции с явными якорями, подзаголовки, списки и абзацы', () => {
    const md = [
      'Вступительный текст документа.',
      '',
      '## Общие положения {#general}',
      'Первый абзац',
      'продолжение абзаца.',
      '',
      '### Подраздел',
      '- пункт один',
      '- пункт два',
      '',
      'Абзац после списка.',
      '## Вторая секция',
      'Текст.',
    ].join('\n');
    expect(parseLegalMarkdown(md)).toEqual({
      intro: 'Вступительный текст документа.',
      sections: [
        {
          id: 'general',
          explicitId: true,
          heading: 'Общие положения',
          blocks: [
            { type: 'p', text: 'Первый абзац продолжение абзаца.' },
            { type: 'subheading', text: 'Подраздел' },
            { type: 'list', items: ['пункт один', 'пункт два'] },
            { type: 'p', text: 'Абзац после списка.' },
          ],
        },
        {
          id: 'section-2',
          explicitId: false,
          heading: 'Вторая секция',
          blocks: [{ type: 'p', text: 'Текст.' }],
        },
      ],
    });
  });

  it('документ без ## → только intro, секций нет', () => {
    expect(parseLegalMarkdown('Просто текст.\n\nЕщё абзац.')).toEqual({
      intro: 'Просто текст. Ещё абзац.',
      sections: [],
    });
  });

  it('пустая строка и CRLF не ломают разбор; пустой вход → пусто', () => {
    expect(parseLegalMarkdown('')).toEqual({ intro: undefined, sections: [] });
    expect(parseLegalMarkdown('## A {#a}\r\nтекст\r\n')).toEqual({
      intro: undefined,
      sections: [{ id: 'a', explicitId: true, heading: 'A', blocks: [{ type: 'p', text: 'текст' }] }],
    });
  });
});

describe('legalAnchorWarnings', () => {
  const ru = '## Общие {#general}\nтекст';
  it('нет предупреждений при явных и совпадающих якорях', () => {
    expect(legalAnchorWarnings({ ru, uz: '## Umumiy {#general}\nmatn', en: '## General {#general}\ntext' })).toEqual([]);
  });
  it('предупреждает о неявных якорях и расхождении наборов', () => {
    const w = legalAnchorWarnings({ ru, uz: '## Umumiy\nmatn', en: '## Other {#other}\ntext' });
    expect(w.some((m) => m.includes('uz'))).toBe(true);
    expect(w.some((m) => m.includes('различаются'))).toBe(true);
  });
});
