import type { InventoryItem, StorageSlot } from '../../../net/GameConnection';
import type { ShopInteraction, ShopItem } from '../../../ui/hudStore';

/** Shop window model for an online vendor (all actions wired to network sends). */
export function vendorShopInteraction(args: {
  vendorName: string;
  balance: number;
  networkId: number;
  sendVendorBuy: (networkId: number, slot: number, itemId: number, quantity: number) => void;
  sendVendorSell: (networkId: number, slot: StorageSlot, itemId: string) => void;
  openBag: () => void;
}): ShopInteraction {
  const { vendorName, balance, networkId, sendVendorBuy, sendVendorSell, openBag } = args;
  return {
    vendorName,
    currency: 'Gold',
    balance,
    items: [],
    onBuy: (item, quantity) => {
      sendVendorBuy(networkId, item.slot, item.id, Math.max(1, quantity));
    },
    // Without the vendor's own second page, selling is done from the
    // bag: each thing's card offers to sell it while a vendor is open.
    // The second page asks through `onSellItem`, one thing at a time,
    // the way the server takes it.
    onSell: openBag,
    onSellItem: (item: InventoryItem) => {
      if (!item.slot) return;
      sendVendorSell(networkId, item.slot, item.id);
    },
  };
}

/** Shop window model when a local-only vendor has no server behind it yet. */
export function offlineVendorShopInteraction(vendorName: string, balance: number): ShopInteraction {
  return {
    vendorName,
    currency: 'Gold',
    balance,
    items: [{ id: 0, slot: 0, name: 'Vendor inventory loading...', price: 0, stock: null }],
    onBuy: () => {},
    onSell: () => {},
  };
}

/**
 * The shop's rows from the vendor's tabs, named by entry until the tables say
 * better. A stock of null (what the server sends), zero or anything else
 * uncountable reads as never running out.
 */
export function shopItemsFromTabs(
  tabs: ReadonlyArray<{
    items?: ReadonlyArray<{
      entry: number;
      slot: number;
      buyPrice: number;
      stock: number | null;
      lesson?: 'learned' | 'cannot';
    }>;
  }>,
): ShopItem[] {
  return tabs.flatMap(tab =>
    (tab.items ?? []).map(item => ({
      id: item.entry,
      slot: item.slot,
      name: `Item ${item.entry}`,
      price: item.buyPrice,
      stock: item.stock !== null && item.stock > 0 ? item.stock : null,
      ...(item.lesson ? { lesson: item.lesson } : {}),
    })),
  );
}
