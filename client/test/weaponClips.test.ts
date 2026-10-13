/**
 * Combat clip names, which are not the names the animation table gives.
 *
 * No playable race folder ships a clip called `combat_ready` or `combat01`.
 * What they ship is one per clip family, picked between by appending the
 * family of what the hand holds to the table's name. Asking for the bare
 * name gets no clip, and getting no clip is silent: the body carries on
 * playing whatever it was.
 */

import { describe, expect, it } from 'vitest';

import {
  UNARMED,
  WEAPON_SLOT,
  combatClipName,
  familyOf,
  weaponsFromHands,
} from '../src/gameplay/weaponClips';
import type { EquippedWeapons } from '../src/gameplay/weaponClips';

const WEAPON = 2;
const ARMOUR = 4;

const item = (itemClass: number, subClass: number) => ({ itemClass, subClass });
const melee = (itemClass: number, subClass: number) => familyOf(item(itemClass, subClass), 'melee');

function holding(over: Partial<EquippedWeapons> = {}): EquippedWeapons {
  return { ...UNARMED, ...over };
}

describe('the family a hand swings with', () => {
  it('swings a weapon whose kind names a family with that family', () => {
    for (const subClass of [0, 1, 2]) expect(melee(WEAPON, subClass)).toBe('1h');
    for (const subClass of [8, 9, 10]) expect(melee(WEAPON, subClass)).toBe('2h');
    expect(melee(WEAPON, 3)).toBe('dagger');
    expect(familyOf(item(WEAPON, 16), 'ranged')).toBe('bow');
    expect(familyOf(item(WEAPON, 17), 'ranged')).toBe('crossbow');
  });

  it('swings a spear, and a staff with it, as a polearm', () => {
    expect(melee(WEAPON, 12)).toBe('polearm');
    expect(melee(WEAPON, 11)).toBe('polearm');
  });

  it('punches with an empty hand, and throws from an empty ranged slot', () => {
    expect(familyOf(null, 'melee')).toBe('stave');
    expect(familyOf(null, 'ranged')).toBe('thrown');
    expect(UNARMED).toEqual({ mainhand: 'stave', offhand: 'stave', ranged: 'thrown' });
  });

  it('punches with a fist weapon, and throws with a wand', () => {
    expect(melee(WEAPON, 4)).toBe('stave');
    expect(familyOf(item(WEAPON, 20), 'ranged')).toBe('thrown');
  });

  it('plays no family for a character holding something that does not swing', () => {
    // A shield, an off-hand rod, or something of no known kind: no suffix,
    // and no body ships the bare name, so no swing plays.
    expect(melee(ARMOUR, 5)).toBe('');
    expect(melee(ARMOUR, 6)).toBe('');
    expect(melee(WEAPON, 99)).toBe('');
    expect(familyOf(item(ARMOUR, 5), 'ranged')).toBe('');
    expect(combatClipName('combat01', holding({ mainhand: melee(ARMOUR, 5) }))).toBe('combat01');
  });

  it('fights bare-handed when a creature holds something that does not swing', () => {
    expect(familyOf(item(ARMOUR, 5), 'melee', 'creature')).toBe('stave');
    expect(familyOf(item(WEAPON, 99), 'ranged', 'creature')).toBe('thrown');
  });

  it('punches with a fist weapon from the ranged slot too', () => {
    expect(familyOf(item(WEAPON, 4), 'ranged')).toBe('stave');
  });

  it('takes a character hand that names no item as empty, whatever kind it says', () => {
    const hands = {
      mainhand: { entry: 0, itemClass: WEAPON, subClass: 0 },
      offhand: { entry: 7, itemClass: WEAPON, subClass: 3 },
      ranged: { entry: 0, itemClass: ARMOUR, subClass: 5 },
    };
    expect(weaponsFromHands(hands)).toEqual({
      mainhand: 'stave',
      offhand: 'dagger',
      ranged: 'thrown',
    });
    // A shield the character does hold swings nothing.
    expect(
      weaponsFromHands({ ...hands, mainhand: { entry: 9, itemClass: ARMOUR, subClass: 5 } })
        .mainhand,
    ).toBe('');
  });

  it('reads a creature’s hands by the kind the server says, since they name no item', () => {
    const hands = {
      mainhand: { entry: 0, itemClass: WEAPON, subClass: 0 },
      offhand: { entry: 7, itemClass: ARMOUR, subClass: 5 },
      ranged: { entry: 0, itemClass: 0, subClass: 0 },
    };
    expect(weaponsFromHands(hands, 'creature')).toEqual({
      mainhand: '1h',
      offhand: 'stave',
      ranged: 'thrown',
    });
  });
});

describe('naming the clip a body can actually play', () => {
  it('suffixes a combat clip with the main hand', () => {
    const weapons = holding({ mainhand: '2h' });
    expect(combatClipName('combat_ready', weapons)).toBe('combat_ready_2h');
    expect(combatClipName('combat01', weapons)).toBe('combat01_2h');
    expect(combatClipName('combat_critical', weapons)).toBe('combat_critical_2h');
  });

  it('reads the ranged slot for the three clips that shoot', () => {
    const weapons = holding({ mainhand: 'stave', ranged: 'bow' });
    expect(combatClipName('combat_load', weapons)).toBe('combat_load_bow');
    expect(combatClipName('combat_aim', weapons)).toBe('combat_aim_bow');
    expect(combatClipName('combat_fire', weapons)).toBe('combat_fire_bow');
    expect(combatClipName('combat_ready', weapons)).toBe('combat_ready_stave');
  });

  it('reads the off hand for the off-hand swing', () => {
    const weapons = holding({ mainhand: '2h', offhand: 'dagger' });
    expect(combatClipName('combat03', weapons)).toBe('combat03_dagger');
    expect(combatClipName('combat01', weapons)).toBe('combat01_2h');
  });

  it('leaves a name the table already resolved alone', () => {
    const weapons = holding({ mainhand: '1h' });
    expect(combatClipName('combat_block_shield', weapons)).toBe('combat_block_shield');
    expect(combatClipName('combat_ready_bow', weapons)).toBe('combat_ready_bow');
  });

  it('leaves everything outside the combat family alone', () => {
    const weapons = holding({ mainhand: '1h' });
    for (const clip of ['magic_directed_gather', 'magic_directed_release', 'idle', 'run_normal']) {
      expect(combatClipName(clip, weapons)).toBe(clip);
    }
  });

  it('leaves a body told it holds nothing on the bare names', () => {
    // Null is "do not suffix": a wolf ships `combat01` and no `combat01_1h`.
    expect(combatClipName('combat01', null)).toBe('combat01');
    expect(combatClipName('combat_ready', null)).toBe('combat_ready');
  });

  it('does not suffix a hand with no family', () => {
    expect(combatClipName('combat01', holding({ mainhand: '' }))).toBe('combat01');
  });

  it('reads the weapons from the slots the protocol puts them in', () => {
    expect(WEAPON_SLOT).toEqual({ mainhand: 13, offhand: 14, ranged: 15 });
  });
});
