import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

const playSpy = vi.hoisted(() => vi.fn());
vi.mock('./notificationSound', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./notificationSound')>()),
  playNotificationSound: playSpy,
}));

import { useUnreadSound } from './useUnreadSound';

describe('useUnreadSound', () => {
  it('молчит пока не готово (ready=false), даже при росте total', () => {
    playSpy.mockClear();
    const { rerender } = renderHook(({ n, r }) => useUnreadSound(n, r), {
      initialProps: { n: 0, r: false },
    });
    rerender({ n: 5, r: false });
    expect(playSpy).not.toHaveBeenCalled();
  });

  it('первый готовый замер — база без звука (нет «динь» на логине)', () => {
    playSpy.mockClear();
    const { rerender } = renderHook(({ n, r }) => useUnreadSound(n, r), {
      initialProps: { n: 0, r: false },
    });
    rerender({ n: 3, r: true }); // данные пришли: первый готовый замер = база
    expect(playSpy).not.toHaveBeenCalled();
  });

  it('звук при росте после готовности, тишина при уменьшении', () => {
    playSpy.mockClear();
    const { rerender } = renderHook(({ n, r }) => useUnreadSound(n, r), {
      initialProps: { n: 3, r: true }, // база = 3
    });
    expect(playSpy).not.toHaveBeenCalled();
    rerender({ n: 5, r: true }); // рост 3 -> 5
    expect(playSpy).toHaveBeenCalledTimes(1);
    rerender({ n: 2, r: true }); // уменьшение
    expect(playSpy).toHaveBeenCalledTimes(1);
  });

  it('после логаута повторная готовность не звучит', () => {
    playSpy.mockClear();
    const { rerender } = renderHook(({ n, r }) => useUnreadSound(n, r), {
      initialProps: { n: 4, r: true }, // база 4
    });
    rerender({ n: 0, r: false }); // логаут — сброс базы
    rerender({ n: 4, r: true }); // ре-логин: первый готовый замер = база
    expect(playSpy).not.toHaveBeenCalled();
  });
});
