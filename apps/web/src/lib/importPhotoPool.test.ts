import { describe, expect, it } from 'vitest';
import { runPool, withRetry } from './importPhotoPool';

describe('runPool', () => {
  it('обрабатывает всё, не больше concurrency одновременно', async () => {
    let active = 0;
    let peak = 0;
    const seen: number[] = [];
    await runPool([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      seen.push(n);
      active -= 1;
    });
    expect(seen.sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(peak).toBe(3);
  });

  it('ошибка одного элемента не останавливает остальные', async () => {
    const seen: number[] = [];
    await runPool([1, 2, 3], 2, async (n) => {
      if (n === 2) throw new Error('x');
      seen.push(n);
    });
    expect(seen.sort()).toEqual([1, 3]);
  });
});

describe('withRetry', () => {
  it('повторяет только при shouldRetry и не больше retries раз', async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls += 1;
          throw new Error('net');
        },
        2,
        () => true,
        0,
      ),
    ).rejects.toThrow('net');
    expect(calls).toBe(3);
    calls = 0;
    await expect(
      withRetry(
        async () => {
          calls += 1;
          throw new Error('422');
        },
        2,
        () => false,
        0,
      ),
    ).rejects.toThrow('422');
    expect(calls).toBe(1);
  });
});
