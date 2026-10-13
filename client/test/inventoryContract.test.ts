/**
 * The inventory contract against the server's own bytes
 * (`fixtures/inventoryMessagesFromServer.json`, generated in `ubiquitous-server`; copy,
 * never hand-edit). Only shared bytes catch a top-level vs nested `item` mismatch.
 */

import { describe, expect, it } from 'vitest';

import fixture from './fixtures/inventoryMessagesFromServer.json';
import { WebSocketConnection } from '../src/net/WebSocketConnection';
import type { ConnectionEvents, InventoryItem, StorageSlot } from '../src/net/GameConnection';
import { FakeWebSocket } from './helpers/fakeWebSocket';
import { itemErrorMessage, itemResultOk } from '../src/net/itemErrors';
import { EQUIPMENT_SLOTS, wornAt } from '../src/ui/items';

const messages = fixture as unknown as Record<string, Record<string, unknown>>;

interface SwapSide {
  itemId: string;
  from: StorageSlot | null;
}

interface Seen {
  snapshot: { bagSlotCount: number; bankSlotCount: number; items: InventoryItem[] } | null;
  added: InventoryItem | null;
  removed: string | null;
  moved: { itemId: string; from: StorageSlot | null; to: StorageSlot | null } | null;
  swapped: { first: SwapSide; second: SwapSide } | null;
  equipResult: string | null;
  appearance: number[] | null;
  stack: { itemId: string; slot: StorageSlot | null; count: number } | null;
  bank: { bankSlotCount: number; items: InventoryItem[] } | null;
  capacity: { area: string; capacity: number } | null;
  sorted: { ok: boolean; area: string } | null;
  bankOpen: boolean | null;
  protocolErrors: number;
}

/** Plays every message in the fixture through the production reader, in one session. */
async function replayFixture(): Promise<Seen> {
  const socket = new FakeWebSocket();
  const seen: Seen = {
    snapshot: null,
    added: null,
    removed: null,
    moved: null,
    swapped: null,
    equipResult: null,
    appearance: null,
    stack: null,
    bank: null,
    capacity: null,
    sorted: null,
    bankOpen: null,
    protocolErrors: 0,
  };

  const events: ConnectionEvents = {
    onInventory: (bagSlotCount, bankSlotCount, items) => {
      seen.snapshot = { bagSlotCount, bankSlotCount, items };
    },
    onInventoryItemAdded: item => {
      seen.added = item;
    },
    onInventoryItemRemoved: itemId => {
      seen.removed = itemId;
    },
    onInventoryItemMoved: (itemId, from, to) => {
      seen.moved = { itemId, from, to };
    },
    onInventoryItemsSwapped: (first, second) => {
      seen.swapped = { first, second };
    },
    onInventoryEquipResult: code => {
      seen.equipResult = code;
    },
    onEntityAppearanceChanged: (_networkId, equipment) => {
      seen.appearance = [...equipment];
    },
    onInventoryStackChanged: (itemId, slot, count) => {
      seen.stack = { itemId, slot, count };
    },
    onBankUpdated: (bankSlotCount, items) => {
      seen.bank = { bankSlotCount, items };
    },
    onInventoryCapacityChanged: (area, capacity) => {
      seen.capacity = { area, capacity };
    },
    onInventorySorted: (ok, area) => {
      seen.sorted = { ok, area };
    },
    onBankOpen: open => {
      seen.bankOpen = open;
    },
    onProtocolError: () => {
      seen.protocolErrors += 1;
    },
  };

  const conn = new WebSocketConnection({
    url: 'ws://server.invalid:7020',
    createSocket: () => socket,
  });
  const connecting = conn.connect(events);
  socket.accept();
  await connecting;

  for (const [type, payload] of Object.entries(messages)) socket.emit(type, payload);
  return seen;
}

describe('every inventory message exactly as the server writes it', () => {
  it('reaches a handler — none is dropped or rejected', async () => {
    const seen = await replayFixture();
    expect(seen.protocolErrors).toBe(0);
    // Named individually rather than counted, so a message quietly removed
    // from the fixture cannot make this pass by shrinking the total.
    expect(seen.snapshot).not.toBeNull();
    expect(seen.added).not.toBeNull();
    expect(seen.removed).not.toBeNull();
    expect(seen.moved).not.toBeNull();
    expect(seen.swapped).not.toBeNull();
    expect(seen.equipResult).not.toBeNull();
    expect(seen.appearance).not.toBeNull();
    expect(seen.stack).not.toBeNull();
    expect(seen.bank).not.toBeNull();
    expect(seen.capacity).not.toBeNull();
    expect(seen.sorted).not.toBeNull();
    expect(seen.bankOpen).not.toBeNull();
  });

  it('covers every message the server actually sends', async () => {
    // The fixture is the contract, so a message added on the server side must
    // appear here too rather than sitting untested. This fails loudly when
    // the copied file grows and this test was not extended with it.
    expect(Object.keys(messages).sort()).toEqual(
      [
        'entity.appearanceChanged',
        'inventory.bankOpen',
        'inventory.bankUpdated',
        'inventory.capacityChanged',
        'inventory.equipResult',
        'inventory.itemAdded',
        'inventory.itemMoved',
        'inventory.itemRemoved',
        'inventory.itemsSwapped',
        'inventory.sorted',
        'inventory.stackChanged',
        'inventory.updated',
      ].sort(),
    );
  });

  it('reads a pushed item from the top level, where the server writes it', async () => {
    // The item *is* the payload: a single-item push carries the item block as its whole body, and reaching for a
    // nested `item` member yields undefined and an item that never lands in
    // the bag.
    const added = (await replayFixture()).added!;
    expect(added.id).toBe('item-90001-1');
    expect(added.entry).toBe(90001);
    expect(added.count).toBe(1);
    expect(added.slot).toEqual({ area: 'bag', index: 3 });
  });

  it('reads a snapshot row and a pushed item into the same thing', async () => {
    // The two share one shape and must stay one reader here.
    const seen = await replayFixture();
    expect(seen.snapshot!.items).toHaveLength(1);
    expect(seen.snapshot!.items[0]).toEqual(seen.added);
  });

  it('keeps the identity on a removal, which is all a removal carries', async () => {
    expect((await replayFixture()).removed).toBe('item-90001-1');
  });

  it('keeps both ends of a move', async () => {
    const moved = (await replayFixture()).moved!;
    expect(moved.itemId).toBe('item-90001-1');
    expect(moved.from).toEqual({ area: 'bag', index: 3 });
    expect(moved.to).toEqual({ area: 'bag', index: 7 });
  });

  it('keeps the new count and the slot it applies to on a drawn-down stack', async () => {
    const stack = (await replayFixture()).stack!;
    expect(stack.itemId).toBe('item-90001-1');
    expect(stack.slot).toEqual({ area: 'bag', index: 3 });
    expect(stack.count).toBe(4);
  });

  it('keeps the capacities, which decide how much bag there is to fill', async () => {
    const seen = await replayFixture();
    expect(seen.snapshot!.bagSlotCount).toBe(16);
    expect(seen.snapshot!.bankSlotCount).toBe(24);
    expect(seen.bank!.bankSlotCount).toBe(24);
    expect(seen.capacity).toEqual({ area: 'bag', capacity: 20 });
  });

  it('carries the row that says where an item is worn', async () => {
    // Without an inventoryType the interface cannot tell a bow from a bread roll, so
    // `wornAt` answers null for everything and nothing is ever equippable.
    const added = (await replayFixture()).added!;
    expect(added.prototype.inventoryType).toBe(13);
    expect(wornAt(added.prototype.inventoryType)).toBe('Ranged');
    expect(added.prototype.requiredLevel).toBe(1);
  });

  it('reads an exchange as each side naming where it came from', async () => {
    const swapped = (await replayFixture()).swapped!;
    expect(swapped.first.itemId).toBe('item-90001-1');
    expect(swapped.first.from).toEqual({ area: 'bag', index: 3 });
    // No id is the empty side: the item is moving into a free socket and
    // there is nothing to send back the other way.
    expect(swapped.second.itemId).toBe('');
    expect(swapped.second.from).toEqual({ area: 'equipment', index: 15 });
  });

  it('reads an equip refusal as a code it has words for', async () => {
    const code = (await replayFixture()).equipResult!;
    expect(itemResultOk(code)).toBe(false);
    expect(itemErrorMessage(code)).toBe('You cannot equip that.');
  });

  it('reads appearance as sixteen positional slots, not a list of worn items', async () => {
    // A flat list would render whatever is first on the character's head. The bow belongs at fifteen and the head stays
    // empty.
    const appearance = (await replayFixture()).appearance!;
    expect(appearance).toHaveLength(EQUIPMENT_SLOTS.length);
    expect(appearance[15]).toBe(90001);
    expect(appearance[13]).toBe(90002);
    expect(appearance[0]).toBe(0);
  });

  it('keeps the answers that are only ever a yes or a no', async () => {
    const seen = await replayFixture();
    expect(seen.sorted).toEqual({ ok: true, area: 'bag' });
    expect(seen.bankOpen).toBe(true);
  });
});
