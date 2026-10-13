/** Auction state: market rows, own listings and the bid box; rows show `Item {entry}` until named. */

import { signal } from '@preact/signals';

import type { StorageSlot } from '../net/GameConnection';
import type { ItemFacts } from '../assets/types';

/** One market row as the window shows it. */
export interface AuctionListingView {
  id: string;
  sellerName: string;
  itemEntry: number;
  itemCount: number;
  /** Resolved display name; `Item {entry}` until the lookup lands. */
  name: string;
  startPrice: number;
  listedAt: number;
  expiresAt: number;
  buyoutPrice?: number;
  currentBid: number;
  highestBidder?: string;
  /**
   * What the item itself is, once read out of the user's game file.
   *
   * A market row crosses the wire as an entry and nothing else, so this
   * is absent until the client has looked the item up.
   */
  facts?: ItemFacts;
  /** What the item's own words say about it, where it has any. */
  description?: string;
}

/** A search kind: a class, a class range, a worn place, or several; a row answers if it matches any. */
export interface AuctionKind {
  itemClass?: number;
  subClass?: number;
  subClassFrom?: number;
  subClassTo?: number;
  inventoryType?: number;
}

/** What the market was asked for, and which page of the answer. */
export interface AuctionSearch {
  name?: string;
  minLevel?: number;
  maxLevel?: number;
  kinds?: AuctionKind[];
  quality?: number;
  offset?: number;
  limit?: number;
}

export interface AuctionInteraction {
  listings: AuctionListingView[];
  /**
   * How many rows answer the search in all, and where the page showing
   * starts — both the server's, so the screen can say how many pages
   * there are without asking for them.
   */
  total?: number;
  offset?: number;
  /** Whether anything was searched yet: unasked and empty look alike but mean opposite things. */
  searched?: boolean;
  /** The last outcome, success or refusal reason — placeholder feedback. */
  status: string | null;
  onBrowse(search: AuctionSearch): void;
  onList(
    from: StorageSlot,
    itemId: string,
    startPrice: number,
    durationHours: number,
    buyoutPrice?: number,
  ): void;
  onBid(id: string, amount: number): void;
  onBuyout(id: string): void;
  onCancel(id: string): void;
}

export const auctionInteraction = signal<AuctionInteraction | null>(null);

export function showAuction(interaction: AuctionInteraction): void {
  auctionInteraction.value = interaction;
}

export function updateAuctionListings(
  listings: AuctionInteraction['listings'],
  total?: number,
  offset?: number,
): void {
  if (auctionInteraction.value) {
    auctionInteraction.value = {
      ...auctionInteraction.value,
      listings,
      ...(total === undefined ? {} : { total }),
      ...(offset === undefined ? {} : { offset }),
    };
  }
}

export function setAuctionStatus(status: string | null): void {
  if (auctionInteraction.value) {
    auctionInteraction.value = { ...auctionInteraction.value, status };
  }
}

export function closeAuction(): void {
  auctionInteraction.value = null;
}
