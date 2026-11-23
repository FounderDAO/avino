import { describe, expect, it } from 'vitest';
import { AGENT_MIN_LISTINGS, isAgentIndexable } from './agentIndex';

describe('isAgentIndexable', () => {
  it('indexes agents with a description or enough listings', () => {
    expect(isAgentIndexable({ about: 'Агентство в Ташкенте', activeListingsCount: 0 })).toBe(true);
    expect(isAgentIndexable({ about: null, activeListingsCount: AGENT_MIN_LISTINGS })).toBe(true);
  });

  it('keeps thin profiles out of the index', () => {
    expect(isAgentIndexable({ about: null, activeListingsCount: 2 })).toBe(false);
    expect(isAgentIndexable({ about: '   ', activeListingsCount: 1 })).toBe(false);
    expect(isAgentIndexable({})).toBe(false);
  });
});
