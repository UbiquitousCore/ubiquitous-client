/**
 * The question a teleport master's fare asks before anything is spent.
 *
 * The server quotes the price after a destination is picked, and the
 * journey is only paid for on a yes, so the answer waits here until the
 * player gives one. `AskPromptContainer` shows it.
 */

import { signal } from '@preact/signals';

import { formatMoney } from './money';

export interface TravelQuestion {
  /** The place being travelled to, in its own name. */
  place: string;
  /** What the journey costs, written in coins. */
  fare: string;
  accept(): void;
  decline(): void;
}

export const travelQuestion = signal<TravelQuestion | null>(null);

/** A sum in copper as the question writes it: each coin's name capitalised. */
export function fareWords(copper: number): string {
  return formatMoney(copper).replace(/\b[a-z]/g, letter => letter.toUpperCase());
}

export function askTravel(question: TravelQuestion): void {
  travelQuestion.value = question;
}

export function clearTravelQuestion(): void {
  travelQuestion.value = null;
}
