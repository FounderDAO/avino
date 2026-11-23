import { describe, expect, it } from 'vitest';
import { metaDescription } from './text';

describe('metaDescription', () => {
  it('keeps short text as is, with whitespace collapsed', () => {
    expect(metaDescription('Дом  в\nФергане')).toBe('Дом в Фергане');
  });

  it('cuts long text at a word boundary and adds an ellipsis', () => {
    const text = 'Продаётся просторный семикомнатный частный дом '.repeat(6);
    const out = metaDescription(text);
    expect(out.length).toBeLessThanOrEqual(155);
    expect(out.endsWith('…')).toBe(true);
    expect(out).not.toMatch(/\s…$/);
    // last word before the ellipsis is a whole word from the source
    const lastWord = out.slice(0, -1).split(' ').pop()!;
    expect(text.split(' ')).toContain(lastWord);
  });
});
