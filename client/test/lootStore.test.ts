/**
 * The loot window's own rules.
 *
 * Two of these are the ones worth having. **Nothing is removed because the
 * player clicked it** — a take is a request and the row leaves when the
 * server says so, because a bag that was full would otherwise empty the
 * window and leave it lying about what is on the body. And **a row is named
 * by its own slot, not by where it sits in the list**, because rows the
 * player may not see never arrive and the two numbers then differ.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import type { LootContents, LootRow } from '../src/net/GameConnection';
import {
  closeLoot,
  lootActions,
  dismissLoot,
  lootIsEmpty,
  lootWindow,
  removeLootMoney,
  removeLootRow,
  setLootActions,
  setLootContents,
} from '../src/ui/lootStore';

const BODY = 7;

function row(slot: number, entry: number): LootRow {
  return {
    slot,
    itemId: `item-${slot}`,
    entry,
    namePrefixId: 0,
    nameTextId: 0,
    prefixTextId: 0,
    itemClass: 0,
    subClass: 0,
    quality: 2,
    count: 1,
    displayInfoId: 0,
  };
}

function body(money: number, rows: LootRow[]): LootContents {
  return { networkId: BODY, money, items: rows };
}

beforeEach(() => {
  closeLoot();
  setLootActions({ take: () => {}, takeMoney: () => {}, close: () => {} });
});

describe('opening a body', () => {
  it('shows what is on it', () => {
    setLootContents(body(50, [row(0, 100)]));
    expect(lootWindow.value?.items).toHaveLength(1);
    expect(lootIsEmpty.value).toBe(false);
  });

  it('does not open on a body with nothing on it', () => {
    // The server answers an empty body with an empty list rather than with
    // silence, so this really happens and must not leave a blank page up.
    setLootContents(body(0, []));
    expect(lootWindow.value).toBeNull();
  });
});

describe('taking things', () => {
  it('removes a row by the slot the row carries, not by its position', () => {
    // Slot 1 is missing: somebody else has it reserved, so it never arrived.
    setLootContents(body(0, [row(0, 100), row(2, 300)]));
    removeLootRow(BODY, 2);
    expect(lootWindow.value?.items.map(item => item.slot)).toEqual([0]);
  });

  it('ignores a removal aimed at a different body', () => {
    setLootContents(body(0, [row(0, 100)]));
    removeLootRow(BODY + 1, 0);
    expect(lootWindow.value?.items).toHaveLength(1);
  });

  it('closes once the last thing is gone', () => {
    setLootContents(body(50, [row(0, 100)]));
    removeLootRow(BODY, 0);
    expect(lootWindow.value).not.toBeNull(); // the coin is still there
    removeLootMoney(BODY);
    expect(lootWindow.value).toBeNull();
  });

  it('leaves the window alone until the server says the row is gone', () => {
    const asked: number[] = [];
    setLootActions({ take: (_id, slot) => asked.push(slot), takeMoney: () => {}, close: () => {} });
    setLootContents(body(0, [row(0, 100)]));

    // Exactly what a tap on the plinth does, and all it does.
    lootActions().take(BODY, 0);

    expect(asked).toEqual([0]);
    // The row is still there. The server can refuse this — a full bag, an
    // item somebody else has claimed — and a window that had already emptied
    // itself would be lying about the body until the corpse went away.
    expect(lootWindow.value?.items).toHaveLength(1);
  });
});

describe('closing', () => {
  it('only closes the body it names', () => {
    setLootContents(body(0, [row(0, 100)]));
    // A container elsewhere going free is broadcast to everyone nearby and
    // must not shut the window on the body under the player's feet.
    closeLoot(BODY + 1);
    expect(lootWindow.value).not.toBeNull();
    closeLoot(BODY);
    expect(lootWindow.value).toBeNull();
  });

  it('tells the server when the player closes it', () => {
    const closed: number[] = [];
    setLootActions({ take: () => {}, takeMoney: () => {}, close: id => closed.push(id) });
    setLootContents(body(10, []));
    dismissLoot();
    // Not a courtesy: a container nobody says this about stays locked to
    // everybody, the player who opened it included.
    expect(closed).toEqual([BODY]);
    expect(lootWindow.value).toBeNull();
  });
});
