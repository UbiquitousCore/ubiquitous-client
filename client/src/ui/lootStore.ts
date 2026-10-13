/**
 * The body being looted: server-owned list (taking a row is a request; rows
 * leave when the server says so). One window at a time; opens on contents,
 * closes when they run out.
 */

import { computed, signal } from '@preact/signals';

import type { LootContents, LootRow } from '../net/GameConnection';

export type { LootContents, LootRow };

/** The body currently open, or nothing. */
export const lootWindow = signal<LootContents | null>(null);

/** Whether anything is left in it — the coin counts. */
export const lootIsEmpty = computed(() => {
  const open = lootWindow.value;
  return open === null || (open.money <= 0 && open.items.length === 0);
});

/** Show a body's contents; an empty answer means empty and closes the window. */
export function setLootContents(contents: LootContents): void {
  if (contents.money <= 0 && contents.items.length === 0) {
    closeLoot(contents.networkId);
    return;
  }
  lootWindow.value = contents;
}

/** Remove a row by its own slot, not its list position (hidden rows leave gaps). */
export function removeLootRow(networkId: number, slot: number): void {
  const open = lootWindow.value;
  if (!open || open.networkId !== networkId) return;
  const items = open.items.filter(item => item.slot !== slot);
  if (items.length === open.items.length) return;
  applyOrClose({ ...open, items });
}

/** The coin is gone. */
export function removeLootMoney(networkId: number): void {
  const open = lootWindow.value;
  if (!open || open.networkId !== networkId || open.money === 0) return;
  applyOrClose({ ...open, money: 0 });
}

function applyOrClose(next: LootContents): void {
  lootWindow.value = next.money <= 0 && next.items.length === 0 ? null : next;
}

/** Close the window; `networkId` stops another container going free from closing ours. */
export function closeLoot(networkId?: number): void {
  const open = lootWindow.value;
  if (!open) return;
  if (networkId !== undefined && open.networkId !== networkId) return;
  lootWindow.value = null;
}

// ---------------------------------------------------------------------------
// What the interface asks the game to do: handlers defaulting to nothing.
// ---------------------------------------------------------------------------
export interface LootActions {
  /** Take one row, by the slot the row carries. */
  take(networkId: number, slot: number): void;
  /** Take the coin. */
  takeMoney(networkId: number): void;
  /** Tell the server the body is free; unlike `closeLoot`, which only hides. Unsaid, it stays locked to all. */
  close(networkId: number): void;
}

const NOTHING: LootActions = {
  take: () => {},
  takeMoney: () => {},
  close: () => {},
};

let actions: LootActions = NOTHING;

export function setLootActions(next: LootActions): void {
  actions = next;
}

export function lootActions(): LootActions {
  return actions;
}

/** Close the window and tell the server, which is what a player's close is. */
export function dismissLoot(): void {
  const open = lootWindow.value;
  if (!open) return;
  lootWindow.value = null;
  actions.close(open.networkId);
}
