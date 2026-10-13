import { describe, expect, it, vi } from 'vitest';

import { auctionHouseInteraction } from '../src/app/features/auction/auctionHouseInteraction';

describe('auctionHouseInteraction', () => {
  it('wires browse/list/bid/buyout/cancel callbacks', () => {
    const browse = vi.fn();
    const list = vi.fn();
    const bid = vi.fn();
    const buyout = vi.fn();
    const cancel = vi.fn();

    const ui = auctionHouseInteraction({
      sendAuctionBrowse: browse,
      sendAuctionList: list,
      sendAuctionBid: bid,
      sendAuctionBuyout: buyout,
      sendAuctionCancel: cancel,
    });

    ui.onBrowse({ name: 'ring' });
    ui.onList({ area: 'bag', index: 2 }, 'item-9', 100, 24, 200);
    ui.onBid('row-1', 777);
    ui.onBuyout('row-2');
    ui.onCancel('row-3');

    expect(browse).toHaveBeenCalledWith({ name: 'ring' });
    expect(list).toHaveBeenCalledWith({ area: 'bag', index: 2 }, 'item-9', 100, 24, 200);
    expect(bid).toHaveBeenCalledWith('row-1', 777);
    expect(buyout).toHaveBeenCalledWith('row-2');
    expect(cancel).toHaveBeenCalledWith('row-3');
  });
});
