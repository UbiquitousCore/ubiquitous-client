/**
 * The auction contract between ubiquitous-server and this client,
 * checked against the wire shapes the server actually sends.
 *
 * The payloads below mirror `WebPayloads.Auction.cs` field for field —
 * `auction.listings` rows included, since a renamed server field that the
 * client keeps reading under the old name is exactly how a market goes
 * blank while both suites stay green. If the server's shapes change,
 * update these to match rather than loosening them here.
 */

import { describe, expect, it, vi } from 'vitest';

import { WebSocketConnection } from '../src/net/WebSocketConnection';
import type { AuctionListing, ConnectionEvents } from '../src/net/GameConnection';
import { FakeWebSocket } from './helpers/fakeWebSocket';

async function connected(
  socket: FakeWebSocket,
  events: ConnectionEvents,
): Promise<WebSocketConnection> {
  const conn = new WebSocketConnection({
    url: 'ws://ubiquitous.invalid:7020',
    createSocket: () => socket,
  });
  const connecting = conn.connect(events);
  socket.accept();
  await connecting;
  return conn;
}

const serverRow = {
  id: 'auction-abc',
  sellerName: 'Ayla',
  itemEntry: 100,
  itemCount: 2,
  startPrice: 100,
  listedAt: 1700000000,
  expiresAt: 1700007200,
  buyoutPrice: 500,
  currentBid: 150,
  highestBidder: 'Borin',
};

describe('auction.listings as the server describes it', () => {
  it('arrives parsed, not dropped', async () => {
    const socket = new FakeWebSocket();
    let listings: AuctionListing[] | null = null;
    await connected(socket, {
      onAuctionListings: value => {
        listings = value;
      },
    });

    socket.emit('auction.listings', { listings: [serverRow] });

    expect(listings).not.toBeNull();
    expect(listings).toHaveLength(1);
    expect(listings![0]).toMatchObject({
      id: 'auction-abc',
      sellerName: 'Ayla',
      itemEntry: 100,
      itemCount: 2,
      startPrice: 100,
      buyoutPrice: 500,
      currentBid: 150,
      highestBidder: 'Borin',
    });
  });

  it('tolerates a bid-only row with no buyout and no bids yet', async () => {
    const socket = new FakeWebSocket();
    let listings: AuctionListing[] | null = null;
    await connected(socket, {
      onAuctionListings: value => {
        listings = value;
      },
    });

    const { buyoutPrice, currentBid, highestBidder, ...bidOnly } = serverRow;
    void buyoutPrice;
    void currentBid;
    void highestBidder;
    socket.emit('auction.listings', { listings: [bidOnly] });

    expect(listings).toHaveLength(1);
    // Absent on the wire stays absent here, so the window can tell
    // "bid-only" from "buyout of zero" — and 0 bids from a bid of 0.
    expect(listings![0]!.buyoutPrice).toBeUndefined();
    expect(listings![0]!.highestBidder).toBeUndefined();
    expect(listings![0]!.currentBid).toBe(0);
  });
});

describe('auction outcomes as the server describes them', () => {
  it('routes listed/bid/bought/cancelled to their own handlers with reasons intact', async () => {
    const socket = new FakeWebSocket();
    const events = {
      onAuctionListed: vi.fn(),
      onAuctionBidPlaced: vi.fn(),
      onAuctionBought: vi.fn(),
      onAuctionCancelled: vi.fn(),
    };
    await connected(socket, events);

    socket.emit('auction.listed', { ok: true, id: 'auction-abc', reason: null });
    socket.emit('auction.bidPlaced', {
      ok: false,
      id: 'auction-abc',
      currentBid: 150,
      reason: 'Bid too low.',
    });
    socket.emit('auction.bought', { ok: true, id: 'auction-abc', price: 500, reason: null });
    socket.emit('auction.cancelled', { ok: false, id: 'auction-abc', reason: 'Not yours.' });

    expect(events.onAuctionListed).toHaveBeenCalledWith(true, 'auction-abc', null);
    expect(events.onAuctionBidPlaced).toHaveBeenCalledWith(
      false,
      'auction-abc',
      150,
      'Bid too low.',
    );
    expect(events.onAuctionBought).toHaveBeenCalledWith(true, 'auction-abc', 500, null);
    expect(events.onAuctionCancelled).toHaveBeenCalledWith(false, 'auction-abc', 'Not yours.');
  });
});

describe('what the client sends for the auction house', () => {
  it('lists with the whole stack named and the buyout omitted when bid-only', async () => {
    const socket = new FakeWebSocket();
    const conn = await connected(socket, {});

    conn.sendAuctionList({ area: 'bag', index: 0 }, 'starter-item', 100, 12);
    conn.sendAuctionList({ area: 'bag', index: 1 }, 'other-item', 100, 12, 500);

    expect(socket.sent).toHaveLength(2);
    expect(socket.sent[0]).toMatchObject({
      type: 'auction.list',
      payload: {
        from: { area: 'bag', index: 0 },
        itemId: 'starter-item',
        startPrice: 100,
        durationHours: 12,
      },
    });
    // Absent beats null: the server reads a missing buyout as "bid-only".
    expect(socket.sent[0]!.payload).not.toHaveProperty('buyoutPrice');
    expect(socket.sent[1]!.payload).toMatchObject({ buyoutPrice: 500 });
  });

  it('browses blank for everything and bids/buys/cancels by id', async () => {
    const socket = new FakeWebSocket();
    const conn = await connected(socket, {});

    conn.sendAuctionBrowse({});
    conn.sendAuctionBrowse({ name: 'windblade' });
    conn.sendAuctionBid('auction-abc', 200);
    conn.sendAuctionBuyout('auction-abc');
    conn.sendAuctionCancel('auction-abc');

    expect(socket.sent.map(message => message.type)).toEqual([
      'auction.browse',
      'auction.browse',
      'auction.bid',
      'auction.buyout',
      'auction.cancel',
    ]);
    expect(socket.sent[0]!.payload).not.toHaveProperty('query');
    expect(socket.sent[1]!.payload).toMatchObject({ query: 'windblade' });
    expect(socket.sent[2]!.payload).toMatchObject({ id: 'auction-abc', amount: 200 });
    expect(socket.sent[3]!.payload).toMatchObject({ id: 'auction-abc' });
    expect(socket.sent[4]!.payload).toMatchObject({ id: 'auction-abc' });
  });

  it('sends the conditions the market screen was showing, and which page', async () => {
    // The kinds are the numbers an item's own row carries, never the words
    // for them: narrowing by a word would match nothing.
    const socket = new FakeWebSocket();
    const conn = await connected(socket, {});

    conn.sendAuctionBrowse({
      kinds: [{ itemClass: 2, subClassFrom: 0, subClassTo: 6 }],
      quality: 3,
      minLevel: 10,
      maxLevel: 40,
      offset: 25,
      limit: 25,
    });

    expect(socket.sent[0]!.payload).toMatchObject({
      kinds: [{ itemClass: 2, subClassFrom: 0, subClassTo: 6 }],
      quality: 3,
      minLevel: 10,
      maxLevel: 40,
      offset: 25,
      limit: 25,
    });
  });

  it('reads back how many rows answered, not how many it was sent', async () => {
    const socket = new FakeWebSocket();
    const seen: Array<{ rows: number; total: number; offset: number }> = [];
    await connected(socket, {
      onAuctionListings: (listings, total, offset) =>
        seen.push({ rows: listings.length, total, offset }),
    });

    socket.emit('auction.listings', {
      listings: [{ id: 'a', sellerName: 'Ayla', itemEntry: 1, itemCount: 1, startPrice: 10 }],
      total: 40,
      offset: 25,
    });

    expect(seen).toEqual([{ rows: 1, total: 40, offset: 25 }]);
  });
});
