import { afterEach, describe, expect, it } from 'vitest';

import {
  applyPlayerValues,
  heroSheet,
  heroStats,
  patchHeroSheet,
  isRaised,
  patchHeroStats,
  player,
  resourceForClass,
} from '../src/ui/hudStore';

describe('resourceForClass', () => {
  it('picks morale for a warrior', () => {
    expect(resourceForClass(1)).toBe('morale');
  });

  it('picks vigor for a ranger', () => {
    expect(resourceForClass(3)).toBe('vigor');
  });

  it('picks mana for a mage, a monk, and anything unrecognised', () => {
    expect(resourceForClass(2)).toBe('mana');
    expect(resourceForClass(4)).toBe('mana');
    expect(resourceForClass(0)).toBe('mana');
  });
});

describe('applyPlayerValues', () => {
  afterEach(() => {
    player.value = null;
  });

  it('keeps the id the server addresses the hero by, which the hero’s auras are held under', () => {
    applyPlayerValues({}, { name: 'Sample', level: 1, classId: 1, networkId: 40 });
    expect(player.value?.networkId).toBe(40);
    // A later batch that does not repeat it keeps it.
    applyPlayerValues({}, { name: 'Sample', level: 1, classId: 1 });
    expect(player.value?.networkId).toBe(40);
  });
});

describe('the hero’s attributes', () => {
  afterEach(() => {
    player.value = null;
    heroStats.value = null;
  });

  it('reads each one and its base out of a player.updated', () => {
    applyPlayerValues(
      { strength: 26, baseStrength: 21, agility: 21, baseAgility: 21 },
      { name: 'Sample', level: 17, classId: 4 },
    );
    expect(heroStats.value?.strength).toEqual({ value: 26, base: 21 });
    expect(heroStats.value?.agility).toEqual({ value: 21, base: 21 });
  });

  it('keeps what a later batch does not mention', () => {
    const known = patchHeroStats(null, {
      strength: 21,
      baseStrength: 21,
      wisdom: 38,
      baseWisdom: 38,
    });
    const later = patchHeroStats(known, { strength: 26 });
    expect(later?.strength).toEqual({ value: 26, base: 21 });
    expect(later?.wisdom).toEqual({ value: 38, base: 38 });
  });

  it('leaves them unknown while no batch has carried any', () => {
    expect(patchHeroStats(null, { health: 10 })).toBeNull();
  });

  it('calls a stat raised only while it stands above its base', () => {
    expect(isRaised({ value: 26, base: 21 })).toBe(true);
    expect(isRaised({ value: 21, base: 21 })).toBe(false);
    expect(isRaised({ value: 18, base: 21 })).toBe(false);
  });
});

describe('the hero’s character sheet', () => {
  afterEach(() => {
    player.value = null;
    heroSheet.value = null;
  });

  it('reads its figures out of a player.updated', () => {
    applyPlayerValues(
      { attackPower: 64, hitChance: 9500, armor: 135 },
      { name: 'Sample', level: 17, classId: 1 },
    );
    expect(heroSheet.value).toEqual({ attackPower: 64, hitChance: 9500, armor: 135 });
  });

  it('keeps what a later batch does not mention, and stays unknown until one carries any', () => {
    expect(patchHeroSheet(null, { health: 10 })).toBeNull();
    const known = patchHeroSheet(null, { attackPower: 64, parryChance: 0 });
    expect(patchHeroSheet(known, { parryChance: 150 })).toEqual({
      attackPower: 64,
      parryChance: 150,
    });
  });
});
