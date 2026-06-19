import { describe, it, expect } from 'vitest';
import reducer, { setTerritory, clearTerritory } from './territorySlice';

describe('territorySlice', () => {
  it('defaults to null points', () => {
    expect(reducer(undefined, { type: '@@INIT' })).toEqual({ points: null });
  });

  it('sets points', () => {
    const next = reducer({ points: null }, setTerritory('41.3,69.2;41.4,69.3;41.2,69.4'));
    expect(next.points).toBe('41.3,69.2;41.4,69.3;41.2,69.4');
  });

  it('clears points', () => {
    const next = reducer({ points: 'x' }, clearTerritory());
    expect(next.points).toBeNull();
  });
});
