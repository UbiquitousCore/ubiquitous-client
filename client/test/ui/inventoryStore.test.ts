import { beforeEach, describe, expect, it } from 'vitest';
import type { InventoryItem, StorageSlot } from '../../src/net/GameConnection';
import {
  addInventoryItem,
  bagSlots,
  clearInventory,
  equippedSlots,
  inventory,
  setInventory,
  setInventoryActions,
  setInventoryStack,
  setStorageCapacity,
  swapInventoryItems,
  itemDescription,
  setItemText,
} from '../../src/ui/inventoryStore';

/**
 * The ledger.
 *
 * The whole inventory is sent once, when the character enters the world, and
 * everything after it is a delta with no way to ask for the lot again. So
 * these are about the deltas: each one has to land exactly, because a lost
 * or misapplied one leaves the bag wrong until the next login.
 */

function item(
  id: string,
  slot: StorageSlot | null,
  over: Partial<InventoryItem> = {},
): InventoryItem {
  return {
    id,
    slot,
    entry: 100,
    namePrefixId: 0,
    nameTextId: 700,
    prefixTextId: 0,
    itemClass: 2,
    subClass: 7,
    quality: 4,
    count: 1,
    duration: 0,
    durability: 55,
    maxDurability: 60,
    flags: 0,
    stats: [],
    prototype: {
      entry: 100,
      itemClass: 2,
      subClass: 7,
      nameTextId: 700,
      displayInfoId: 900,
      quality: 4,
      flags: 0,
      buyPrice: 0,
      sellPrice: 0,
      currency: 0,
      inventoryType: 13,
      itemLevel: 1,
      requiredLevel: 1,
      maxStack: 20,
      containerSlots: 0,
      stats: [],
      damage: [],
      armour: 0,
      delay: 0,
      range: 0,
      spells: [],
      bonding: 0,
      descriptionStringId: 0,
      maxDurability: 60,
      expiresAfter: 0,
    },
    ...over,
  };
}

const BAG_0: StorageSlot = { area: 'bag', index: 0 };
const BAG_3: StorageSlot = { area: 'bag', index: 3 };
const MAIN_HAND: StorageSlot = { area: 'equipment', index: 13 };

beforeEach(() => {
  clearInventory();
  setInventoryActions({
    move: () => {},
    equip: () => {},
    unequip: () => {},
    use: () => {},
    destroy: () => {},
    sell: () => {},
    sort: () => {},
    upgrade: () => {},
  });
});

describe('the inventory ledger', () => {
  it('indexes each area by slot, leaving the gaps as gaps', () => {
    // A bag with a hole in the middle is an ordinary state, and packing the
    // list to close it would move every item after the hole.
    setInventory(20, 0, [item('a', BAG_3), item('b', MAIN_HAND)]);

    expect(bagSlots.value[0]).toBeUndefined();
    expect(bagSlots.value[3]?.id).toBe('a');
    expect(equippedSlots.value[13]?.id).toBe('b');
  });

  it('replaces an item that arrives again under an id it already holds', () => {
    setInventory(20, 0, [item('a', BAG_0, { count: 1 })]);
    addInventoryItem(item('a', BAG_0, { count: 5 }));

    expect(inventory.value.items).toHaveLength(1);
    expect(bagSlots.value[0]?.count).toBe(5);
  });

  it('crosses two items over on a swap, because each names where it was', () => {
    setInventory(20, 0, [item('a', BAG_0), item('b', BAG_3)]);

    swapInventoryItems({ itemId: 'a', from: BAG_0 }, { itemId: 'b', from: BAG_3 });

    expect(bagSlots.value[0]?.id).toBe('b');
    expect(bagSlots.value[3]?.id).toBe('a');
  });

  it('moves one item when the other side of a swap was empty', () => {
    // An all-zero id means nothing was there: there is no second item to send
    // back the other way, and treating the zero as one would invent an item.
    setInventory(20, 0, [item('a', BAG_0)]);

    swapInventoryItems({ itemId: 'a', from: BAG_0 }, { itemId: '0000000000000000', from: BAG_3 });

    expect(bagSlots.value[0]).toBeUndefined();
    expect(bagSlots.value[3]?.id).toBe('a');
    expect(inventory.value.items).toHaveLength(1);
  });

  it('applies a stack change without touching the rest', () => {
    setInventory(20, 0, [item('a', BAG_0, { count: 3 })]);

    setInventoryStack('a', BAG_0, 7);

    expect(bagSlots.value[0]?.count).toBe(7);
    expect(bagSlots.value[0]?.durability).toBe(55);
  });

  it('changes one capacity without disturbing the other', () => {
    setInventory(20, 40, []);
    setStorageCapacity('bag', 36);

    expect(inventory.value.bagSlotCount).toBe(36);
    expect(inventory.value.bankSlotCount).toBe(40);
  });
});

describe("an item's description", () => {
  it('is the string its prototype points at, once that has been resolved', () => {
    const item = {
      id: 'a',
      entry: 1,
      prototype: { descriptionStringId: 900 },
    } as unknown as InventoryItem;
    expect(itemDescription(item)).toBeUndefined();
    setItemText(900, 'Opens a door somebody forgot.');
    expect(itemDescription(item)).toBe('Opens a door somebody forgot.');
  });

  it('is nothing for an item with no description string at all', () => {
    const item = {
      id: 'a',
      entry: 1,
      prototype: { descriptionStringId: 0 },
    } as unknown as InventoryItem;
    setItemText(0, 'never');
    expect(itemDescription(item)).toBeUndefined();
  });
});
