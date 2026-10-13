import { describe, expect, it } from 'vitest';

import { heldAction } from '../../src/ui/heldItem';
import type { ItemFacts } from '../../src/assets/types';

const facts = (over: Partial<ItemFacts> = {}): ItemFacts =>
  ({
    itemClass: 0,
    subClass: 0,
    inventoryType: 0,
    spells: [],
    spellSlots: [],
    startsQuest: 0,
    ...over,
  }) as ItemFacts;

const inBag = { slot: { area: 'bag' as const, index: 0 } };
const onBody = { slot: { area: 'equipment' as const, index: 0 } };

describe('what the card for a thing you have offers', () => {
  it('offers to put on a thing that is worn somewhere', () => {
    expect(heldAction(inBag, facts({ inventoryType: 1 }))).toBe('equip');
  });

  it('offers to take off a thing already being worn', () => {
    expect(heldAction(onBody, facts({ inventoryType: 1 }))).toBe('unequip');
  });

  it('offers to use a thing whose spell fires on use', () => {
    expect(heldAction(inBag, facts({ spellSlots: [{ id: 123, trigger: 1 }] }))).toBe('use');
  });

  it('offers to use a thing whose spell does not wait for it to be worn', () => {
    expect(
      heldAction(
        inBag,
        facts({ itemClass: 10, subClass: 2, spellSlots: [{ id: 123, trigger: 0 }] }),
      ),
    ).toBe('use');
  });

  it('offers to use a thing whose kind is what is used, as the bag does', () => {
    // A box or chest, a quest item used by kind, and a guild stone.
    expect(heldAction(inBag, facts({ itemClass: 5, subClass: 0 }))).toBe('use');
    expect(heldAction(inBag, facts({ itemClass: 10, subClass: 1 }))).toBe('use');
    expect(heldAction(inBag, facts({ itemClass: 0, subClass: 10 }))).toBe('use');
  });

  it('offers a quest starter with no use nothing', () => {
    expect(heldAction(inBag, facts({ itemClass: 10, subClass: 2, startsQuest: 9103 }))).toBeNull();
  });

  it('offers Use only on a thing in the bag', () => {
    const box = facts({ itemClass: 5, subClass: 0 });
    const potion = facts({ spellSlots: [{ id: 123, trigger: 1 }] });
    const atTheBank = { slot: { area: 'bank' as const, index: 0 } };
    const nowhere = { slot: null };
    for (const where of [atTheBank, onBody, nowhere]) {
      expect(heldAction(where, box)).toBeNull();
      expect(heldAction(where, potion)).toBeNull();
    }
  });

  it('offers nothing for a thing that is neither', () => {
    // A stack of cloth is a description and nothing else.
    expect(heldAction(inBag, facts())).toBeNull();
    // Nor does a spell that fires only while worn make a thing usable.
    expect(heldAction(inBag, facts({ spellSlots: [{ id: 7, trigger: 2 }] }))).toBeNull();
    expect(heldAction(inBag, null)).toBeNull();
  });

  it('puts wearing before using, as the card does', () => {
    // Something worn that also carries a spell is put on, not used: the
    // card asks whether it can be worn first.
    expect(
      heldAction(inBag, facts({ inventoryType: 5, spellSlots: [{ id: 7, trigger: 1 }] })),
    ).toBe('equip');
  });
});
