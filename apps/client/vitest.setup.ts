import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// RTL's waitFor checks `typeof jest !== 'undefined'` and calls `jest.advanceTimersByTime`.
// Vitest doesn't expose a global `jest` in the module scope of node_modules, so we
// inject it here so RTL takes the fake-timers branch when vi.useFakeTimers() is active.
// See: https://github.com/testing-library/dom-testing-library/blob/main/src/helpers.ts
if (typeof (globalThis as unknown as Record<string, unknown>).jest === 'undefined') {
  (globalThis as unknown as Record<string, unknown>).jest = vi;
}
