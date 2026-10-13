/**
 * Summon stones. The window lists the party members a stone can call, as
 * the server last said; the question is a summon another member put to
 * this player, waiting for an answer. Both are the server's to open.
 */

import { signal } from '@preact/signals';

import type { SummonMember } from '../net/GameConnection';

export type { SummonMember };

export interface SummonWindow {
  stoneId: number;
  members: readonly SummonMember[];
}

export const summonWindow = signal<SummonWindow | null>(null);

export interface SummonQuestion {
  summonerName: string;
  /** Where the summoner stands, named; empty where the place has no name. */
  place: string;
}

export const summonQuestion = signal<SummonQuestion | null>(null);

export function openSummonWindow(stoneId: number, members: readonly SummonMember[]): void {
  summonWindow.value = { stoneId, members };
}

export function closeSummonWindow(): void {
  summonWindow.value = null;
}

export function askSummon(question: SummonQuestion): void {
  summonQuestion.value = question;
}

// ---------------------------------------------------------------------------
// What the interface asks the game to do: handlers defaulting to nothing.
// ---------------------------------------------------------------------------
export interface SummonActions {
  request(stoneId: number, memberId: number): void;
  answer(accept: boolean): void;
}

let actions: SummonActions = { request: () => {}, answer: () => {} };

export function setSummonActions(next: SummonActions): void {
  actions = next;
}

/** Call one member; the window has done its job and closes. */
export function summonMember(memberId: number): void {
  const open = summonWindow.value;
  if (!open) return;
  actions.request(open.stoneId, memberId);
  summonWindow.value = null;
}

export function answerSummon(accept: boolean): void {
  if (!summonQuestion.value) return;
  summonQuestion.value = null;
  actions.answer(accept);
}
