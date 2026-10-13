/**
 * A trade from this side. `trade.updated` describes the opponent; `myOffer`
 * is confirmed by the update it causes. Items move as ordinary deltas.
 */

import { signal } from '@preact/signals';

import type { TradeCancelReason, TradeState } from '../net/GameConnection';

export type { TradeCancelReason, TradeState };

/** One item on either side of the table, as the wire describes it. */
export interface TradeItem {
  id: string;
  entry: number;
  count: number;
}

/** `asked` is this client's own record: a request succeeds silently. */
export type TradePhase = 'idle' | 'asked' | 'invited' | 'open';

export const tradePhase = signal<TradePhase>('idle');

/** The other side, once there is one. Null while idle. */
export const tradeOpponent = signal<number | null>(null);

/** The other side's name, where the game knew it when they arrived. */
export const tradeOpponentName = signal<string | null>(null);

/** What this client last successfully offered. Local — see the file's note. */
export const myOffer = signal<{ itemIds: string[]; gold: number }>({ itemIds: [], gold: 0 });

/** What the opponent is offering, and both confirm flags. Wholly the server's. */
export const opponentOffer = signal<{
  items: TradeItem[];
  gold: number;
  opponentConfirmed: boolean;
  yourConfirmed: boolean;
}>({ items: [], gold: 0, opponentConfirmed: false, yourConfirmed: false });

/** The last thing the trade system said that was not a `protocol.error`. */
export const tradeNotice = signal<string | null>(null);

/** Whether the trade window is showing. Local: there is no `trade.close`. */
export const tradeOpen = signal(false);

export function closeTradeWindow(): void {
  tradeOpen.value = false;
}

/** Back to nothing in progress, keeping the window and its last notice. */
function clearNegotiation(): void {
  tradePhase.value = 'idle';
  tradeOpponent.value = null;
  tradeOpponentName.value = null;
  myOffer.value = { itemIds: [], gold: 0 };
  opponentOffer.value = { items: [], gold: 0, opponentConfirmed: false, yourConfirmed: false };
}

/** This client asked to trade with somebody. Nothing has confirmed it yet. */
export function noteTradeAsked(networkId: number, name: string | null = null): void {
  tradePhase.value = 'asked';
  tradeOpponent.value = networkId;
  tradeOpponentName.value = name;
  tradeNotice.value = 'Trade proposed — waiting for an answer.';
}

/** Somebody wants to trade with this player. The answer is asked for on screen. */
export function applyTradeRequested(fromId: number, name: string | null = null): void {
  tradePhase.value = 'invited';
  tradeOpponent.value = fromId;
  tradeOpponentName.value = name;
  tradeNotice.value = 'A trade was proposed to you.';
}

/**
 * This player answered a proposal. The question goes away either way: a
 * yes is followed by `trade.started`, a no by nothing at all.
 */
export function noteTradeAnswered(): void {
  if (tradePhase.value !== 'invited') return;
  clearNegotiation();
}

/** The proposal this client made was turned down. */
export function applyTradeDeclined(): void {
  clearNegotiation();
  tradeNotice.value = 'They declined.';
}

/** Both sides are now at the table, with empty offers. */
export function applyTradeStarted(opponentId: number, name: string | null = null): void {
  tradePhase.value = 'open';
  if (tradeOpponent.value !== opponentId || name !== null) tradeOpponentName.value = name;
  tradeOpponent.value = opponentId;
  myOffer.value = { itemIds: [], gold: 0 };
  opponentOffer.value = { items: [], gold: 0, opponentConfirmed: false, yourConfirmed: false };
  tradeNotice.value = 'Trade open.';
  tradeOpen.value = true;
}

/** The offer last sent and unanswered; an update promotes it to `myOffer` (a refused one never does). */
let pending: { itemIds: string[]; gold: number } | null = null;

/** Record an outgoing offer, to be adopted when the server answers it. */
export function noteOfferSent(itemIds: string[], gold: number): void {
  pending = { itemIds: [...itemIds], gold };
}

/** Drop a refused pending offer (any refusal while open clears — a stale
 * pending would be adopted by the next unrelated update). */
export function clearPendingOffer(): void {
  pending = null;
}

export function applyTradeUpdated(state: TradeState): void {
  tradePhase.value = 'open';
  tradeOpponent.value = state.opponentId;
  opponentOffer.value = {
    items: state.opponentItems,
    gold: state.opponentGold,
    opponentConfirmed: state.opponentConfirmed,
    yourConfirmed: state.yourConfirmed,
  };
  if (pending !== null) {
    myOffer.value = pending;
    pending = null;
  }
}

/** The words a cancellation reason is worth showing as. */
const CANCEL_TEXT: Record<string, string> = {
  cancelled: 'Trade cancelled.',
  out_of_range: 'Trade cancelled — you moved too far apart.',
  offer_changed_after_confirm: 'Trade cancelled — an offer changed after it was confirmed.',
  not_enough_gold: 'Trade cancelled — somebody could not cover their own gold.',
  item_no_longer_available: 'Trade cancelled — an offered item is no longer there.',
  not_enough_bag_space: 'Trade cancelled — somebody had no room for it.',
  trade_refused: 'Trade cancelled — the server refused it.',
};

export function applyTradeCancelled(reason: TradeCancelReason): void {
  clearNegotiation();
  pending = null;
  // Unknown reasons show the raw string rather than a generic sentence: this
  // is a debug window, and the wire value is the useful part.
  tradeNotice.value = CANCEL_TEXT[reason] ?? `Trade cancelled — ${reason}.`;
}

export function applyTradeCompleted(): void {
  clearNegotiation();
  pending = null;
  tradeNotice.value = 'Trade completed.';
}

/** Forget everything, window included. */
export function resetTrade(): void {
  clearNegotiation();
  pending = null;
  tradeNotice.value = null;
  tradeOpen.value = false;
}

// ---------------------------------------------------------------------------
// What the window asks the game to do
// ---------------------------------------------------------------------------

export interface TradeActions {
  /** Propose a trade to whoever the HUD currently has targeted. */
  requestTarget(): void;
  accept(): void;
  decline(): void;
  /**
   * Replace this side's whole offer.
   *
   * Wholesale, not a delta — whatever is left out is no longer offered. Doing
   * this after confirming cancels the trade, which is the server's rule.
   */
  offer(itemIds: string[], gold: number): void;
  confirm(confirmed: boolean): void;
  cancel(): void;
}

const NOTHING: TradeActions = {
  requestTarget: () => {},
  accept: () => {},
  decline: () => {},
  offer: () => {},
  confirm: () => {},
  cancel: () => {},
};

let actions: TradeActions = NOTHING;

export function setTradeActions(next: TradeActions): void {
  actions = next;
}

export function tradeActions(): TradeActions {
  return actions;
}

/** Send an offer, and remember it until the update it causes comes back. */
export function sendOffer(itemIds: string[], gold: number): void {
  noteOfferSent(itemIds, gold);
  actions.offer(itemIds, gold);
}
