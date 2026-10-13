import type { AuctionInteraction, AuctionSearch } from '../../../ui/auctionStore';
import type { StorageSlot } from '../../../net/GameConnection';

/** Auction-house window interaction wired to connection send callbacks. */
export function auctionHouseInteraction(args: {
  sendAuctionBrowse: (search: AuctionSearch) => void;
  sendAuctionList: (
    from: StorageSlot,
    itemId: string,
    startPrice: number,
    durationHours: number,
    buyoutPrice?: number,
  ) => void;
  sendAuctionBid: (id: string, amount: number) => void;
  sendAuctionBuyout: (id: string) => void;
  sendAuctionCancel: (id: string) => void;
}): AuctionInteraction {
  const {
    sendAuctionBrowse,
    sendAuctionList,
    sendAuctionBid,
    sendAuctionBuyout,
    sendAuctionCancel,
  } = args;
  return {
    listings: [],
    status: null,
    onBrowse: search => sendAuctionBrowse(search),
    onList: (from, itemId, startPrice, durationHours, buyoutPrice) =>
      sendAuctionList(from, itemId, startPrice, durationHours, buyoutPrice),
    onBid: (id, amount) => sendAuctionBid(id, amount),
    onBuyout: id => sendAuctionBuyout(id),
    onCancel: id => sendAuctionCancel(id),
  };
}
