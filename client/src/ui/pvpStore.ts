/**
 * Duels and the open-world PvP flag — the two ways one player may hit
 * another. Both only gate whether `attack.engage` between players is allowed.
 * Challenges arrive on the target's next combat tick; unflagging mid-fight
 * does not stop a swing already in flight. (Debug-panel UI for now.)
 */

import { signal } from '@preact/signals';

import type { DuelEndReason } from '../net/GameConnection';

export type { DuelEndReason };

/**
 * Where the duel negotiation has got to.
 *
 * `challenged` has no server acknowledgement behind it — `duel.challenge`
 * answers with silence on success — so it is this client's own record that it
 * asked.
 */
export type DuelPhase = 'idle' | 'challenged' | 'invited' | 'duelling';

export const duelPhase = signal<DuelPhase>('idle');

/** The other side, once there is one. Null while idle. */
export const duelOpponent = signal<number | null>(null);

/** The other side's name, where the game knew it when they arrived. */
export const duelOpponentName = signal<string | null>(null);

/**
 * Whether this body is the other side of a duel under way. Only `duelling`
 * counts: a challenge sent or received makes nobody fair game yet, and every
 * way a duel finishes puts the phase back to `idle`.
 */
export function isDuellingMe(networkId: number): boolean {
  return duelPhase.peek() === 'duelling' && duelOpponent.peek() === networkId;
}

/** The last thing either system said that was not a `protocol.error`. */
export const pvpNotice = signal<string | null>(null);

/** This client challenged somebody. Nothing has confirmed it yet. */
export function noteDuelChallenged(networkId: number): void {
  duelPhase.value = 'challenged';
  duelOpponent.value = networkId;
  pvpNotice.value = 'Challenge sent — it reaches them on their next tick.';
}

/** Somebody challenged this player. The answer is asked for on screen. */
export function applyDuelRequested(fromId: number, name: string | null = null): void {
  duelPhase.value = 'invited';
  duelOpponent.value = fromId;
  duelOpponentName.value = name;
  pvpNotice.value = 'You were challenged to a duel.';
}

/**
 * This player answered a challenge. The question goes away either way: a
 * yes is followed by `duel.started`, a no by nothing at all.
 */
export function noteDuelAnswered(): void {
  if (duelPhase.value !== 'invited') return;
  duelPhase.value = 'idle';
  duelOpponent.value = null;
  duelOpponentName.value = null;
}

/** Declined, or the challenge simply expired unanswered — the same message. */
export function applyDuelDeclined(): void {
  duelPhase.value = 'idle';
  duelOpponent.value = null;
  duelOpponentName.value = null;
  pvpNotice.value = 'The challenge was declined or expired.';
}

export function applyDuelStarted(opponentId: number): void {
  duelPhase.value = 'duelling';
  duelOpponent.value = opponentId;
  pvpNotice.value = 'Duel started.';
}

const OUTCOME_TEXT: Record<string, string> = {
  won: 'You won the duel.',
  lost: 'You lost the duel.',
  forfeited: 'You forfeited.',
  opponentForfeited: 'They forfeited.',
};

export function applyDuelEnded(reason: DuelEndReason): void {
  duelPhase.value = 'idle';
  duelOpponent.value = null;
  duelOpponentName.value = null;
  // An unknown reason is said as the server sent it, rather than not at all.
  pvpNotice.value = OUTCOME_TEXT[reason] ?? `Duel ended — ${reason}.`;
}

/** Forget everything. Neither the flag nor a duel survives a session. */
export function resetPvp(): void {
  duelPhase.value = 'idle';
  duelOpponent.value = null;
  duelOpponentName.value = null;
  pvpNotice.value = null;
}

// ---------------------------------------------------------------------------
// What the window asks the game to do
// ---------------------------------------------------------------------------

export interface PvpActions {
  /** Challenge whoever the HUD currently has targeted. */
  challengeTarget(): void;
  accept(): void;
  decline(): void;
  /** Concede. Always allowed mid-fight, whatever this player's health is. */
  forfeit(): void;
  /** Set or clear the open-world flag. The switch reads the server's echo. */
  setFlagged(flagged: boolean): void;
}

const NOTHING: PvpActions = {
  challengeTarget: () => {},
  accept: () => {},
  decline: () => {},
  forfeit: () => {},
  setFlagged: () => {},
};

let actions: PvpActions = NOTHING;

export function setPvpActions(next: PvpActions): void {
  actions = next;
}

export function pvpActions(): PvpActions {
  return actions;
}
