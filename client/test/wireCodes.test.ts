/**
 * The server names its outcomes and loot states. Outcomes are read as the
 * names themselves; loot states become the numbers `gameplay/loot.ts` uses.
 */

import { describe, expect, it } from 'vitest';

import { OUTCOMES, readLootable, readOutcome } from '../src/net/wireCodes';

describe('readOutcome', () => {
  it('reads every outcome the server names as that name', () => {
    expect([...OUTCOMES].sort()).toEqual([
      'block',
      'critical',
      'dodge',
      'evade',
      'heal',
      'hit',
      'miss',
      'parry',
      'periodicHeal',
    ]);
    for (const name of OUTCOMES) expect(readOutcome(name)).toBe(name);
  });

  it('reads an outcome it does not know, or none, as null', () => {
    expect(readOutcome('somethingNew')).toBeNull();
    expect(readOutcome(undefined)).toBeNull();
    expect(readOutcome(5)).toBeNull();
  });
});

describe('readLootable', () => {
  it('keeps the server loot states by name', () => {
    expect(readLootable('lootable')).toBe('lootable');
    expect(readLootable('emptied')).toBe('emptied');
  });

  it('reads no state as none, and a name it does not have as unknown', () => {
    expect(readLootable(undefined)).toBe('none');
    expect(readLootable(1)).toBe('none');
    expect(readLootable('somethingNew')).toBe('unknown');
  });
});
