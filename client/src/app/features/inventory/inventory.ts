import type { UiArt } from '../../UiArt';
import type { WhoIs } from '../../WhoIs';
import { logger } from '../../../core/log';
import { equipSound, handleSound } from '../../../gameplay/itemSounds';
import type { ItemKind } from '../../../gameplay/itemSounds';
import type {
  ConnectionEvents,
  GameConnection,
  InventoryItem,
  StorageSlot,
} from '../../../net/GameConnection';
import { reportToPlayer } from '../../../gameplay/SpellBook';
import {
  addInventoryItem,
  bankOpen,
  inventory,
  setInventoryActions,
  moveInventoryItem,
  removeInventoryItem,
  setInventory,
  setInventoryStack,
  setStorageCapacity,
  swapInventoryItems,
  itemName,
} from '../../../ui/inventoryStore';
import { popItemGained } from '../../../ui/popMessages';
import { itemErrorMessage, itemResultOk } from '../../../net/itemErrors';

const log = logger('inventory');

/** The bag and the bank: drawn only when the server confirms a change. */
export function inventoryHandlers(art: UiArt): Partial<ConnectionEvents> {
  return {
    onInventory: (bagSlotCount, bankSlotCount, items) => {
      setInventory(bagSlotCount, bankSlotCount, items);
      log.info(`inventory: ${items.length} item(s), ${bagSlotCount} bag slot(s)`);
      for (const item of items) art.resolveItemArt(item);
    },

    onInventoryItemAdded: item => {
      addInventoryItem(item);
      art.resolveItemArt(item);
      // `+ [Name] x N` over the hero's head, as a pop message. The name may
      // not have arrived yet — `itemName` falls back to the entry, and the
      // line is a one-second float, so waiting for the lookup would mean
      // saying nothing at all.
      popItemGained(itemName(item), item.count);
    },

    onInventoryItemRemoved: itemId => removeInventoryItem(itemId),
    onInventoryItemMoved: (itemId, _from, to) => moveInventoryItem(itemId, to),
    onInventoryItemsSwapped: (first, second) => swapInventoryItems(first, second),
    onInventoryStackChanged: (itemId, slot, count) => setInventoryStack(itemId, slot, count),

    onInventoryEquipResult: code => {
      // Only ever a refusal: the success path says nothing on this message
      // and arrives as a slot change and an appearance change instead.
      if (!itemResultOk(code)) {
        log.warn(`equip refused ${code}: ${itemErrorMessage(code)}`);
        reportToPlayer(itemErrorMessage(code));
      }
    },

    onInventoryCapacityChanged: (area, capacity) => setStorageCapacity(area, capacity),
    onBankOpen: open => {
      // The shipped strongbox draws the bag beside the box, so nothing
      // else has to come up with it.
      bankOpen.value = open;
      // Said either way. A silent refusal is indistinguishable from a
      // window that failed to draw, and the window is the first thing
      // anybody suspects.
      if (open) log.info('storage: box open');
      else log.info('storage: box refused (not standing at a real storage box)');
    },
    onBankUpdated: (bankSlotCount, items) => {
      setStorageCapacity('bank', bankSlotCount);
      for (const item of items) {
        addInventoryItem(item);
        art.resolveItemArt(item);
      }
    },
  };
}

/** The sounds the bag makes. */
export interface ItemSounds {
  /** A sound by its file name. */
  play(name: string): void;
  /** One chosen by the item's own kind, once the item's facts have been read. */
  byKind(entry: number, pick: (kind: ItemKind) => string): void;
}

/**
 * Bag and character sheet requests. The bag on screen moves only when the
 * server confirms, never optimistically. `openVendorId` is the vendor whose shop is open, if one is; selling is
 * offered only then.
 */
export function installInventoryActions(
  connection: GameConnection,
  who: Pick<WhoIs, 'targetNetworkId'>,
  sounds: ItemSounds,
  openVendorId: () => number | null,
): void {
  setInventoryActions({
    move: (from: StorageSlot, to: StorageSlot) => {
      connection.sendInventoryMove(from, to);
      const moved = inventory
        .peek()
        .items.find(item => item.slot?.area === from.area && item.slot.index === from.index);
      if (moved) sounds.play(handleSound(moved, false));
    },
    equip: (item: InventoryItem, to?: StorageSlot) => {
      if (item.slot) connection.sendInventoryEquip(item.slot, item.id, true, to);
      sounds.byKind(item.entry, kind => equipSound(kind, true));
    },
    unequip: (item: InventoryItem, to?: StorageSlot) => {
      if (item.slot) connection.sendInventoryEquip(item.slot, item.id, false, to);
      sounds.byKind(item.entry, kind => equipSound(kind, false));
    },
    use: (item: InventoryItem) => {
      if (!item.slot) return;
      // The server decides whether the item needs a target; none sends zero.
      connection.sendInventoryUse(item.slot, item.id, who.targetNetworkId());
    },
    destroy: (item: InventoryItem) => {
      // The whole stack: the server ignores a count that disagrees.
      if (item.slot) connection.sendInventoryDestroy(item.slot, item.id, item.count);
      sounds.play(handleSound(item, false));
    },
    sell: (item: InventoryItem) => {
      const vendorId = openVendorId();
      if (item.slot && vendorId !== null) connection.sendVendorSell(vendorId, item.slot, item.id);
    },
    sort: area => connection.sendInventorySort(area),
    // Any slot the bag has not got: the server then picks the first empty one.
    split: (item, count) => {
      if (item.slot)
        connection.sendInventorySplit(item.slot, item.id, count, { area: 'bag', index: -1 });
    },
    upgrade: (area, slots) => connection.sendUpgradeStorage(area, slots),
  });
}
