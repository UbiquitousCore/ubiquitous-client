/**
 * What the server said when it refused something (`protocol.error`). One
 * shared log rather than per-system routing (refusal codes are shared across
 * systems, so routing would misattribute). A finished client would show these
 * as banners, not a scrolling log.
 */

import { computed, signal } from '@preact/signals';

/** One refusal, as `protocol.error` carries it plus when it landed. */
export interface ProtocolRefusal {
  /** The server's short machine string — `"invalid_party"`, `"trade_refused"`. */
  code: string;
  /** The sentence the server wrote for a person to read. */
  reason: string;
  /** `Date.now()` when the client saw it, for ordering only. */
  at: number;
}

/** How many are kept. A debug log, not a history. */
const KEEP = 20;

/** Newest first. */
export const refusals = signal<readonly ProtocolRefusal[]>([]);

/** The most recent refusal, which is what a window shows on one line. */
export const lastRefusal = computed<ProtocolRefusal | null>(() => refusals.value[0] ?? null);

export function noteRefusal(code: string, reason: string): void {
  refusals.value = [{ code, reason, at: Date.now() }, ...refusals.value].slice(0, KEEP);
}
