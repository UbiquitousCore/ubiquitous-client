/** Other bodies' casts by server id, for the target frame; run on the clock and held at full until the server ends them. */

import { signal } from '@preact/signals';

export interface BodyCast {
  spellId: number;
  /** How long the cast runs, in ms. */
  castTime: number;
  /** When it started, on the clock the caller passes in. */
  startedAt: number;
}

/**
 * How long a full bar stays up past its end with no word from the server,
 * in ms. A body that leaves mid-cast sends no end; without this its bar
 * would stand full for good. Own choice.
 */
export const LINGER_MS = 1_000;

export const bodyCasts = signal<ReadonlyMap<number, BodyCast>>(new Map());

function put(networkId: number, cast: BodyCast | null): void {
  const next = new Map(bodyCasts.value);
  if (cast) next.set(networkId, cast);
  else next.delete(networkId);
  bodyCasts.value = next;
}

/** A body began a cast. An instant spell has no bar to show. */
export function startBodyCast(
  networkId: number,
  spellId: number,
  castTimeMs: number,
  now: number,
): void {
  put(networkId, castTimeMs > 0 ? { spellId, castTime: castTimeMs, startedAt: now } : null);
}

/** A body's cast went off, was refused or was stopped short. */
export function endBodyCast(networkId: number): void {
  if (bodyCasts.value.has(networkId)) put(networkId, null);
}

/** Every cast forgotten, as on leaving a map. */
export function forgetBodyCasts(): void {
  bodyCasts.value = new Map();
}

/**
 * How much of a cast's bar is filled at `now`, 0 to 1, or null where no
 * bar shows: no cast, or one well past its end.
 */
export function bodyCastShare(cast: BodyCast | undefined, now: number): number | null {
  if (!cast) return null;
  const run = now - cast.startedAt;
  if (run >= cast.castTime + LINGER_MS) return null;
  return Math.max(0, Math.min(1, run / cast.castTime));
}
