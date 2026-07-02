import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

const playSpy = vi.hoisted(() => vi.fn());
vi.mock('./notificationSound', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./notificationSound')>()),
  playNotificationSound: playSpy,
}));

import { useUnreadSound } from './useUnreadSound';

describe('useUnreadSound', () => {
  it('молчит на первом рендере, звучит при росте, молчит при уменьшении', () => {
    playSpy.mockClear();
    const { rerender } = renderHook(({ n }) => useUnreadSound(n), {
      initialProps: { n: 0 },
    });
    expect(playSpy).not.toHaveBeenCalled();
    rerender({ n: 2 });
    expect(playSpy).toHaveBeenCalledTimes(1);
    rerender({ n: 1 });
    expect(playSpy).toHaveBeenCalledTimes(1);
  });
});
