import type { ResourceSystem } from '../../../assets/ResourceSystem';
import { resolveItemWords } from '../../itemLookups';
import { auctionHouseInteraction } from './auctionHouseInteraction';
import { auctionOutcome, type AuctionAnswer } from './auctionOutcome';
import type { ConnectionEvents, GameConnection } from '../../../net/GameConnection';
import {
  auctionInteraction,
  setAuctionStatus,
  showAuction,
  updateAuctionListings,
} from '../../../ui/auctionStore';
import type { AuctionListingView } from '../../../ui/auctionStore';
import { setItemIcon, setItemFacts } from '../../../ui/inventoryStore';

function answerAuction(connection: GameConnection, answer: AuctionAnswer): void {
  const outcome = auctionOutcome(answer);
  setAuctionStatus(outcome.status);
  if (outcome.refresh) connection.sendAuctionBrowse();
}

/** Open the auction house; the first browse is what asks the server. */
export function openAuctionHouse(connection: GameConnection): void {
  showAuction(
    auctionHouseInteraction({
      sendAuctionBrowse: search => connection.sendAuctionBrowse(search),
      sendAuctionList: (from, itemId, startPrice, durationHours, buyoutPrice) =>
        connection.sendAuctionList(from, itemId, startPrice, durationHours, buyoutPrice),
      sendAuctionBid: (id, amount) => connection.sendAuctionBid(id, amount),
      sendAuctionBuyout: id => connection.sendAuctionBuyout(id),
      sendAuctionCancel: id => connection.sendAuctionCancel(id),
    }),
  );
}

/** The market. Every answer refreshes the browse rather than guessing new numbers. */
export function auctionHandlers(
  connection: GameConnection,
  resources: ResourceSystem,
): Partial<ConnectionEvents> {
  return {
    onAuctionListed: (ok, _id, reason) => answerAuction(connection, { kind: 'listed', ok, reason }),
    onAuctionOpened: () => openAuctionHouse(connection),
    onAuctionListings: (listings, total, offset) => {
      const views = listings.map(row => ({
        ...row,
        name: `Item ${row.itemEntry}`,
      }));
      // `total` is the server's count, not this page's length.
      updateAuctionListings(views, total, offset);
      const learned = (id: string, more: Partial<AuctionListingView>): void => {
        const current = auctionInteraction.value?.listings ?? [];
        updateAuctionListings(
          current.map(existing => (existing.id === id ? { ...existing, ...more } : existing)),
        );
      };
      for (const row of views) {
        void resources.itemName(row.itemEntry).then(name => {
          if (name) learned(row.id, { name });
        });
        // Cached by entry, so a market of one potion asks once.
        void resources
          .itemIcon(row.itemEntry)
          .then(icon => {
            if (icon) setItemIcon(row.itemEntry, icon);
          })
          .catch(() => {});
        void resources.itemFacts(row.itemEntry).then(async facts => {
          if (!facts) return;
          learned(row.id, { facts });
          setItemFacts(row.itemEntry, facts);
          void resolveItemWords(facts, resources);
          const said = facts.descriptionId
            ? await resources.itemText(facts.descriptionId).catch(() => null)
            : null;
          if (said) learned(row.id, { description: said });
        });
      }
    },
    onAuctionCancelled: (ok, _id, reason) =>
      answerAuction(connection, { kind: 'cancelled', ok, reason }),
    onAuctionBidPlaced: (ok, _id, currentBid, reason) =>
      answerAuction(connection, { kind: 'bid', ok, currentBid, reason }),
    onAuctionBought: (ok, _id, price, reason) =>
      answerAuction(connection, { kind: 'bought', ok, price, reason }),
  };
}
