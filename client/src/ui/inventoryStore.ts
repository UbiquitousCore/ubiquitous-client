/** Character inventory ledger (server deltas only; no full refresh — every
 * delta applied here, never in a component). Engine writes, UI reads. */

import { computed, signal } from '@preact/signals';

import type { ItemFacts, StorageUpgradeRow } from '../assets/types';
import type { InventoryItem, StorageArea, StorageSlot } from '../net/GameConnection';

export type { InventoryItem, StorageArea, StorageSlot };

export interface InventoryState {
  /** How many bag slots this character has. Not how many are full. */
  bagSlotCount: number;
  bankSlotCount: number;
  /** Everything owned, in no particular order; the slot says where each is. */
  items: readonly InventoryItem[];
}

export const inventory = signal<InventoryState>({
  bagSlotCount: 0,
  bankSlotCount: 0,
  items: [],
});

/** Whether the bank window is open, which only a banker can decide. */
export const bankOpen = signal(false);

/** Put the bank window away. The server's own close arrives the same way. */
export function closeBank(): void {
  bankOpen.value = false;
}

/** The storage upgrade ladder from local tables; empty is a real answer (no upgrades). */
export const storageUpgrades = signal<readonly StorageUpgradeRow[]>([]);

export function setStorageUpgrades(rows: readonly StorageUpgradeRow[]): void {
  storageUpgrades.value = rows;
}

/** Item names and icons, resolved from game data and cached by entry id. */
export const itemNames = signal<ReadonlyMap<number, string>>(new Map());
/** Item string-table lines by string id: the descriptions items point at. */
export const itemTexts = signal<ReadonlyMap<number, string>>(new Map());
/** Each item row's facts by entry, kept for comparison cards. */
export const itemFacts = signal<ReadonlyMap<number, ItemFacts>>(new Map());
/** What each spell an item carries does, by spell id. */
export const spellTexts = signal<ReadonlyMap<number, string>>(new Map());
export const itemIcons = signal<ReadonlyMap<number, ImageBitmap>>(new Map());

/** What is in each slot of one area, indexed by slot index. */
function byArea(state: InventoryState, area: StorageArea): Array<InventoryItem | undefined> {
  const slots: Array<InventoryItem | undefined> = [];
  for (const item of state.items) {
    if (item.slot?.area === area) slots[item.slot.index] = item;
  }
  return slots;
}

export const bagSlots = computed(() => byArea(inventory.value, 'bag'));
export const equippedSlots = computed(() => byArea(inventory.value, 'equipment'));
export const bankSlots = computed(() => byArea(inventory.value, 'bank'));

/**
 * The rung that applies to the bag right now, or null at the top of the
 * ladder. Storage 0 is the bag; the bank has its own rungs under storage 1.
 */
export const bagUpgrade = computed<StorageUpgradeRow | null>(() => {
  const capacity = inventory.value.bagSlotCount;
  return storageUpgrades.value.find(row => row.storage === 0 && row.requires === capacity) ?? null;
});

export function setInventory(
  bagSlotCount: number,
  bankSlotCount: number,
  items: InventoryItem[],
): void {
  inventory.value = { bagSlotCount, bankSlotCount, items };
}

/** Add an item, or replace the one already held under its id. */
export function addInventoryItem(item: InventoryItem): void {
  const state = inventory.value;
  const items = state.items.filter(existing => existing.id !== item.id);
  inventory.value = { ...state, items: [...items, item] };
}

export function removeInventoryItem(itemId: string): void {
  const state = inventory.value;
  const items = state.items.filter(item => item.id !== itemId);
  if (items.length === state.items.length) return;
  inventory.value = { ...state, items };
}

function replace(
  items: readonly InventoryItem[],
  id: string,
  change: (item: InventoryItem) => InventoryItem,
): readonly InventoryItem[] {
  return items.map(item => (item.id === id ? change(item) : item));
}

export function moveInventoryItem(itemId: string, to: StorageSlot | null): void {
  const state = inventory.value;
  inventory.value = {
    ...state,
    items: replace(state.items, itemId, item => ({ ...item, slot: to })),
  };
}

/** Two items trade places; each side names its slot before, an all-zero id is an empty side. */
export function swapInventoryItems(
  first: { itemId: string; from: StorageSlot | null },
  second: { itemId: string; from: StorageSlot | null },
): void {
  const state = inventory.value;
  let items = state.items;
  if (first.itemId !== '')
    items = replace(items, first.itemId, item => ({ ...item, slot: second.from }));
  if (second.itemId !== '')
    items = replace(items, second.itemId, item => ({ ...item, slot: first.from }));
  inventory.value = { ...state, items };
}

export function setInventoryStack(itemId: string, slot: StorageSlot | null, count: number): void {
  const state = inventory.value;
  inventory.value = {
    ...state,
    items: replace(state.items, itemId, item => ({ ...item, count, slot: slot ?? item.slot })),
  };
}

export function setStorageCapacity(area: StorageArea, capacity: number): void {
  const state = inventory.value;
  if (area === 'bank') inventory.value = { ...state, bankSlotCount: capacity };
  else if (area === 'bag') inventory.value = { ...state, bagSlotCount: capacity };
}

export function setItemText(stringId: number, text: string): void {
  if (itemTexts.value.get(stringId) === text) return;
  itemTexts.value = new Map(itemTexts.value).set(stringId, text);
}

/** The flavour or teaching line under an item, once resolved; else nothing. */
export function itemDescription(item: InventoryItem): string | undefined {
  const id = item.prototype.descriptionStringId;
  return id ? itemTexts.value.get(id) : undefined;
}

export function setItemFacts(entry: number, facts: ItemFacts): void {
  if (itemFacts.value.has(entry)) return;
  itemFacts.value = new Map(itemFacts.value).set(entry, facts);
}

export function setSpellText(spellId: number, text: string): void {
  if (spellTexts.value.get(spellId) === text) return;
  spellTexts.value = new Map(spellTexts.value).set(spellId, text);
}

export function setItemName(entry: number, name: string): void {
  if (itemNames.value.get(entry) === name) return;
  itemNames.value = new Map(itemNames.value).set(entry, name);
}

export function setItemIcon(entry: number, icon: ImageBitmap): void {
  if (itemIcons.value.has(entry)) return;
  itemIcons.value = new Map(itemIcons.value).set(entry, icon);
}

/** An item's name, falling back to "Item <entry>", which identifies what failed to resolve. */
export function itemName(item: Pick<InventoryItem, 'entry'>): string {
  return itemNames.value.get(item.entry) ?? `Item ${item.entry}`;
}

export function clearInventory(): void {
  inventory.value = { bagSlotCount: 0, bankSlotCount: 0, items: [] };
  bankOpen.value = false;
}

// ---------------------------------------------------------------------------
// What the interface asks the game to do: handlers, since `ui/` may not reach
// the network. Each defaults to nothing, so a lab screen is inert.
// ---------------------------------------------------------------------------
export interface InventoryActions {
  move(from: StorageSlot, to: StorageSlot): void;
  equip(item: InventoryItem, to?: StorageSlot): void;
  /** `to` only if that bag slot is empty: the server refuses an occupied one rather than swapping. */
  unequip(item: InventoryItem, to?: StorageSlot): void;
  use(item: InventoryItem): void;
  destroy(item: InventoryItem): void;
  sell(item: InventoryItem): void;
  sort(area: StorageArea): void;
  /**
   * Buy the next rung. `slots` is what the storage becomes, which is what the
   * server checks against — it re-finds the rung itself and refuses one that
   * does not apply to the capacity it holds.
   */
  upgrade(area: StorageArea, slots: number): void;
}

const NOTHING: InventoryActions = {
  move: () => {},
  equip: () => {},
  unequip: () => {},
  use: () => {},
  destroy: () => {},
  sell: () => {},
  sort: () => {},
  upgrade: () => {},
};

let actions: InventoryActions = NOTHING;

export function setInventoryActions(next: InventoryActions): void {
  actions = next;
}

export function inventoryActions(): InventoryActions {
  return actions;
}
