/**
 * What a hand holds, sorted into the kinds that decide where it rests and
 * which combat clips it plays.
 */

import { describe, expect, it } from 'vitest';

import { heldKind } from '../src/assets/heldKinds';

const WEAPON = 2;
const ARMOUR = 4;

describe('sorting what a hand holds', () => {
  it('puts one-handed swords, axes and maces together', () => {
    for (const subClass of [0, 1, 2]) expect(heldKind(WEAPON, subClass)).toBe('blade');
  });

  it('tells daggers and fist weapons from other one-handers', () => {
    expect(heldKind(WEAPON, 3)).toBe('dagger');
    expect(heldKind(WEAPON, 4)).toBe('fist');
  });

  it('tells long blades and heads from long poles', () => {
    for (const subClass of [8, 9, 10]) expect(heldKind(WEAPON, subClass)).toBe('great');
    for (const subClass of [11, 12]) expect(heldKind(WEAPON, subClass)).toBe('pole');
  });

  it('names each thing that shoots', () => {
    expect(heldKind(WEAPON, 16)).toBe('bow');
    expect(heldKind(WEAPON, 17)).toBe('crossbow');
    expect(heldKind(WEAPON, 20)).toBe('wand');
  });

  it('knows the two things an off hand holds that are not weapons', () => {
    expect(heldKind(ARMOUR, 5)).toBe('shield');
    expect(heldKind(ARMOUR, 6)).toBe('trinket');
  });

  it('has no kind for anything else', () => {
    expect(heldKind(WEAPON, 5)).toBeNull();
    expect(heldKind(WEAPON, 18)).toBeNull();
    expect(heldKind(ARMOUR, 1)).toBeNull();
    expect(heldKind(0, 0)).toBeNull();
  });
});
