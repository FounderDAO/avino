import { describe, it, expect } from 'vitest';
import realtimeReducer, { setSocketConnected } from './realtimeSlice';

describe('realtimeSlice', () => {
  it('дефолт — отключено', () => {
    expect(realtimeReducer(undefined, { type: '@@init' })).toEqual({ socketConnected: false });
  });
  it('setSocketConnected(true) поднимает флаг', () => {
    const s = realtimeReducer(undefined, setSocketConnected(true));
    expect(s.socketConnected).toBe(true);
  });
});
