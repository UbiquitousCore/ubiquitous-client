/**
 * Which combat clip a creature asks for.
 *
 * A humanoid NPC ships the suffixed families a player does
 * (`combat01_1h`, `combat_fire_bow`) and no bare `combat01`, so it is told
 * what its hands hold and resolved by the same rule as a player. A beast
 * ships the bare names and is told it holds nothing.
 */

import { describe, expect, it } from 'vitest';
import { combatClipName, weaponsFromHands } from '../src/gameplay/weaponClips';

const NOTHING = { entry: 0, itemClass: 0, subClass: 0 };
const WEAPON = 2;
const kind = (subClass: number) => ({ entry: 0, itemClass: WEAPON, subClass });
const hands = (mainhand = NOTHING, offhand = NOTHING, ranged = NOTHING) => ({
  mainhand,
  offhand,
  ranged,
});

describe('a creature that carries weapons', () => {
  it('suffixes its swing with what it is holding', () => {
    const weapons = weaponsFromHands(hands(kind(0)), 'creature');
    expect(combatClipName('combat01', weapons)).toBe('combat01_1h');
    expect(combatClipName('combat_critical', weapons)).toBe('combat_critical_1h');
  });

  it('takes the off-hand swing from the off hand and the shot from the ranged slot', () => {
    const weapons = weaponsFromHands(hands(kind(0), kind(3), kind(16)), 'creature');
    expect(combatClipName('combat03', weapons)).toBe('combat03_dagger');
    expect(combatClipName('combat_fire', weapons)).toBe('combat_fire_bow');
  });

  it('fights bare-handed with a hand whose item is of no known kind', () => {
    expect(weaponsFromHands(hands(kind(99)), 'creature').mainhand).toBe('stave');
  });
});

describe('a beast', () => {
  it('stays on the bare names', () => {
    expect(combatClipName('combat01', null)).toBe('combat01');
  });
});
