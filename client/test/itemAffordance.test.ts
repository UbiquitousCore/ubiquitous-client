/**
 * Which of "Equip" and "Use" the bag offers on an item.
 *
 * Both answers come from the item's own table row, which the server sends
 * with every item. Without the row every field defaults to zero, and neither
 * button appears on anything.
 */

import { describe, expect, it } from 'vitest';

import {
  EQUIPMENT_SLOTS,
  equipmentHomesFor,
  qualityName,
  qualityTextClass,
  useOf,
  wornAt,
} from '../src/ui/items';

/** An item row with everything at the zero the client defaults to. */
const bare = {
  itemClass: 0,
  subClass: 0,
  spellSlots: [] as readonly { id: number; trigger: number }[],
};

describe('what the bag offers on an item', () => {
  it('offers nothing on a row the server never sent', () => {
    // An absent row reads as all zeros, and all zeros must not look like a
    // usable, wearable item.
    expect(wornAt(0)).toBeNull();
    expect(useOf(bare)).toBeNull();
  });

  it('offers Equip on anything with a real inventory type', () => {
    // 13 is the ranged worn-slot type.
    expect(wornAt(13)).toBe('Ranged');
    // And a two-hander says so rather than just naming the main hand.
    expect(wornAt(15)).toBe('Two-handed');
  });
});

describe('what using an item does', () => {
  it('casts the spell in a slot that fires on use', () => {
    expect(useOf({ ...bare, spellSlots: [{ id: 100, trigger: 1 }] })).toBe('cast');
    // Whichever slot holds it.
    expect(
      useOf({
        ...bare,
        spellSlots: [
          { id: 0, trigger: 0 },
          { id: 100, trigger: 1 },
        ],
      }),
    ).toBe('cast');
  });

  it('casts a spell whose slot does not wait for the item to be worn', () => {
    expect(
      useOf({ ...bare, itemClass: 10, subClass: 2, spellSlots: [{ id: 100, trigger: 0 }] }),
    ).toBe('cast');
  });

  it('casts nothing from a slot that fires while worn, or a slot with no spell in it', () => {
    expect(useOf({ ...bare, spellSlots: [{ id: 100, trigger: 2 }] })).toBeNull();
    expect(useOf({ ...bare, spellSlots: [{ id: 0, trigger: 1 }] })).toBeNull();
  });

  it('uses a quest item of sub-class 1 as it is, and no other quest kind', () => {
    expect(useOf({ ...bare, itemClass: 10, subClass: 1 })).toBe('byKind');
    expect(useOf({ ...bare, itemClass: 10, subClass: 2 })).toBeNull();
    expect(useOf({ ...bare, itemClass: 10, subClass: 4 })).toBeNull();
  });

  it('opens the found-a-guild prompt for a guild stone', () => {
    expect(useOf({ ...bare, itemClass: 0, subClass: 10 })).toBe('guild');
    expect(useOf({ ...bare, itemClass: 0, subClass: 9 })).toBeNull();
  });

  it('uses class 5 sub-class 0 as it is', () => {
    expect(useOf({ ...bare, itemClass: 5, subClass: 0 })).toBe('byKind');
    expect(useOf({ ...bare, itemClass: 5, subClass: 1 })).toBeNull();
  });
});

describe('where the interface says a piece will land', () => {
  it('agrees with the slot order the server numbers', () => {
    // The position in this list is the slot number on the wire, so a bow
    // previewing as "Head" is the shipped bug in preview form.
    expect(EQUIPMENT_SLOTS[15]).toBe('Ranged');
    expect(EQUIPMENT_SLOTS[13]).toBe('Main hand');
    expect(EQUIPMENT_SLOTS[0]).toBe('Head');
  });

  it('says a bag is worn nowhere, because this build has no container slots', () => {
    expect(wornAt(16)).toBeNull();
    expect(equipmentHomesFor(16)).toEqual([]);
  });
});

describe("how an item's quality reads", () => {
  it('names and tints each rank of the ordered scale', () => {
    expect([1, 2, 3, 4, 5, 6].map(qualityName)).toEqual([
      'Poor',
      'Common',
      'Fine',
      'Rare',
      'Epic',
      'Artifact',
    ]);
    expect(qualityTextClass(3)).toBe('text-quality-fine');
  });

  it('reads a value outside the scale as ordinary', () => {
    for (const offScale of [0, 7, 2147483647]) {
      expect(qualityName(offScale)).toBe('Common');
      expect(qualityTextClass(offScale)).toBe('text-quality-common');
    }
  });
});
