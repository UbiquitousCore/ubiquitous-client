import { describe, expect, it, vi } from 'vitest';

import {
  offlineVendorShopInteraction,
  shopItemsFromTabs,
  vendorShopInteraction,
} from '../src/app/features/vendor/shopInteractions';

describe('vendorShopInteraction', () => {
  it('builds buy/sell handlers around network id and bag opener', () => {
    const buy = vi.fn();
    const sell = vi.fn();
    const openBag = vi.fn();
    const ui = vendorShopInteraction({
      vendorName: 'Ada',
      balance: 123,
      networkId: 77,
      sendVendorBuy: buy,
      sendVendorSell: sell,
      openBag,
    });

    ui.onBuy({ id: 9, slot: 2, name: 'Potion', price: 3, stock: null }, 0);
    expect(buy).toHaveBeenCalledWith(77, 2, 9, 1);

    ui.onSell();
    expect(openBag).toHaveBeenCalledOnce();

    ui.onSellItem?.({ id: '5', slot: null } as never);
    expect(sell).not.toHaveBeenCalled();
    ui.onSellItem?.({ id: '5', slot: { area: 'bag', index: 4 } } as never);
    expect(sell).toHaveBeenCalledWith(77, { area: 'bag', index: 4 }, '5');
  });
});

describe('offlineVendorShopInteraction', () => {
  it('shows a loading placeholder and no-op handlers', () => {
    const ui = offlineVendorShopInteraction('Vendor', 99);
    expect(ui.items).toEqual([
      { id: 0, slot: 0, name: 'Vendor inventory loading...', price: 0, stock: null },
    ]);
    expect(() => ui.onBuy(ui.items[0]!, 1)).not.toThrow();
    expect(() => ui.onSell()).not.toThrow();
  });
});

describe('shopItemsFromTabs', () => {
  it('flattens every tab into rows named by entry', () => {
    const rows = shopItemsFromTabs([
      { items: [{ entry: 5, slot: 0, buyPrice: 30, stock: 4 }] },
      { items: [{ entry: 6, slot: 1, buyPrice: 90, stock: 2 }] },
    ]);
    expect(rows).toEqual([
      { id: 5, slot: 0, name: 'Item 5', price: 30, stock: 4 },
      { id: 6, slot: 1, name: 'Item 6', price: 90, stock: 2 },
    ]);
  });

  it('reads a null or zero stock as never running out, and a tab without items as empty', () => {
    const rows = shopItemsFromTabs([
      {
        items: [
          { entry: 1, slot: 0, buyPrice: 1, stock: null },
          { entry: 2, slot: 1, buyPrice: 1, stock: 0 },
        ],
      },
      {},
    ]);
    expect(rows.map(row => row.stock)).toEqual([null, null]);
  });
});
