/**
 * The trade store's own rules.
 *
 * `trade.updated` describes the opponent and never echoes this player's own
 * offer back, so `myOffer` is local knowledge: an offer is recorded only once
 * the update it caused arrives, because an offer the server refused never
 * produces one. `yourConfirmed` is the opposite case and is always the
 * server's, so a stale `true` must never survive an update that says false.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import type { TradeState } from '../src/net/GameConnection';
import {
  applyTradeCancelled,
  applyTradeCompleted,
  applyTradeDeclined,
  applyTradeRequested,
  applyTradeStarted,
  applyTradeUpdated,
  clearPendingOffer,
  myOffer,
  noteOfferSent,
  noteTradeAsked,
  opponentOffer,
  resetTrade,
  tradeNotice,
  tradeOpen,
  tradeOpponent,
  tradePhase,
} from '../src/ui/tradeStore';

const THEM = 42;

function state(over: Partial<TradeState> = {}): TradeState {
  return {
    opponentId: THEM,
    opponentGold: 0,
    opponentItems: [],
    opponentConfirmed: false,
    yourConfirmed: false,
    ...over,
  };
}

beforeEach(() => {
  resetTrade();
});

describe('getting to the table', () => {
  it('records that this client asked, since success is silent', () => {
    noteTradeAsked(THEM);
    expect(tradePhase.value).toBe('asked');
    expect(tradeOpponent.value).toBe(THEM);
  });

  it('shows an incoming proposal as an invitation', () => {
    applyTradeRequested(THEM);
    expect(tradePhase.value).toBe('invited');
    expect(tradeOpponent.value).toBe(THEM);
  });

  it('opens the window with both offers empty when the trade starts', () => {
    noteTradeAsked(THEM);
    applyTradeStarted(THEM);
    expect(tradePhase.value).toBe('open');
    expect(tradeOpen.value).toBe(true);
    expect(myOffer.value).toEqual({ itemIds: [], gold: 0 });
    expect(opponentOffer.value).toEqual({
      items: [],
      gold: 0,
      opponentConfirmed: false,
      yourConfirmed: false,
    });
  });

  it('clears the negotiation when the proposal is turned down', () => {
    noteTradeAsked(THEM);
    applyTradeDeclined();
    expect(tradePhase.value).toBe('idle');
    expect(tradeOpponent.value).toBeNull();
  });
});

describe('this side of the table', () => {
  it('does not adopt an offer merely because it was sent', () => {
    applyTradeStarted(THEM);
    noteOfferSent(['a'], 5);
    expect(myOffer.value).toEqual({ itemIds: [], gold: 0 });
  });

  it('adopts it when the update it caused comes back', () => {
    applyTradeStarted(THEM);
    noteOfferSent(['a'], 5);
    applyTradeUpdated(state());
    expect(myOffer.value).toEqual({ itemIds: ['a'], gold: 5 });
  });

  it('adopts a sent offer once, not again on the next unrelated update', () => {
    applyTradeStarted(THEM);
    noteOfferSent(['a'], 5);
    applyTradeUpdated(state());
    applyTradeUpdated(state({ opponentGold: 100 }));
    expect(myOffer.value).toEqual({ itemIds: ['a'], gold: 5 });
    expect(opponentOffer.value.gold).toBe(100);
  });

  it('is emptied again by a fresh trade', () => {
    applyTradeStarted(THEM);
    noteOfferSent(['a'], 5);
    applyTradeUpdated(state());
    applyTradeStarted(THEM);
    expect(myOffer.value).toEqual({ itemIds: [], gold: 0 });
  });
});

describe('the other side of the table', () => {
  it('shows what the server says the opponent has put up', () => {
    applyTradeStarted(THEM);
    applyTradeUpdated(
      state({
        opponentGold: 250,
        opponentItems: [{ id: 'i-1', entry: 100, count: 2 }],
        opponentConfirmed: true,
      }),
    );
    expect(opponentOffer.value.gold).toBe(250);
    expect(opponentOffer.value.items).toHaveLength(1);
    expect(opponentOffer.value.opponentConfirmed).toBe(true);
  });

  it("takes this player's own confirmation from the server, never from a local value", () => {
    applyTradeStarted(THEM);
    applyTradeUpdated(state({ yourConfirmed: true }));
    expect(opponentOffer.value.yourConfirmed).toBe(true);
    applyTradeUpdated(state({ yourConfirmed: false }));
    expect(opponentOffer.value.yourConfirmed).toBe(false);
  });
});

describe('ending', () => {
  it('clears the negotiation and says why it was cancelled', () => {
    applyTradeStarted(THEM);
    noteOfferSent(['a'], 5);
    applyTradeUpdated(state({ yourConfirmed: true }));
    applyTradeCancelled('offer_changed_after_confirm');
    expect(tradePhase.value).toBe('idle');
    expect(tradeOpponent.value).toBeNull();
    expect(myOffer.value).toEqual({ itemIds: [], gold: 0 });
    expect(opponentOffer.value.yourConfirmed).toBe(false);
    expect(tradeNotice.value).toContain('offer changed after it was confirmed');
  });

  it('shows an unrecognised reason as the raw string the server sent', () => {
    applyTradeStarted(THEM);
    applyTradeCancelled('the_moon_was_wrong');
    expect(tradeNotice.value).toContain('the_moon_was_wrong');
  });

  it('clears the negotiation when the exchange goes through', () => {
    applyTradeStarted(THEM);
    noteOfferSent(['a'], 5);
    applyTradeUpdated(state({ opponentGold: 250 }));
    applyTradeCompleted();
    expect(tradePhase.value).toBe('idle');
    expect(tradeOpponent.value).toBeNull();
    expect(myOffer.value).toEqual({ itemIds: [], gold: 0 });
    expect(opponentOffer.value.gold).toBe(0);
    expect(tradeNotice.value).toContain('completed');
  });

  it('leaves the window up, which only the player closes', () => {
    applyTradeStarted(THEM);
    applyTradeCompleted();
    expect(tradeOpen.value).toBe(true);
  });

  it('throws away an offer the server refused, rather than adopting it later', () => {
    applyTradeStarted(THEM);
    noteOfferSent(['a'], 5);
    clearPendingOffer();
    applyTradeUpdated(state({ opponentGold: 100 }));
    expect(myOffer.value).toEqual({ itemIds: [], gold: 0 });
  });
});
