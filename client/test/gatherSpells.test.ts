import { describe, expect, it } from 'vitest';

import { GATHER_SPELL_IDS } from '../src/gameplay/actionClips';

describe('the spells that gather from an object', () => {
  it('names the mine, the ordinary and the chest gather', () => {
    expect([...GATHER_SPELL_IDS].sort((a, b) => a - b)).toEqual([23, 57, 1822]);
  });
});
