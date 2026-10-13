/** Corpses: which are worth opening and sparkle. An unknown state stays openable. */

import type { Lootable } from '../world/World';

export type { Lootable };

/**
 * The effect file a body worth opening wears as its sparkle. The glow is
 * shown as the spell visual that plays this file, found in the user's
 * `c_spellvisual` table by the path.
 */
export const LOOT_GLOW_EFFECT = 'Effects/scene/nature/ore_shine.beff';

/** Whether a body should wear the sparkle and answer a click. */
export function worthOpening(lootable: Lootable): boolean {
  return lootable !== 'none' && lootable !== 'emptied';
}

/** Why a click on a body did not ask to open it. */
export type LootRefusal =
  | 'no such body'
  | 'own body'
  | 'not dead'
  | 'body has no server id'
  | 'too far';

/** What a click on a body decided. */
export type LootDecision =
  | { open: true; networkId: number; distance: number | null }
  | { open: false; why: LootRefusal; networkId?: number; distance?: number | null; tell?: string };

/** What the caller knows about the body that was clicked. */
export interface LootTarget {
  /** False when the world holds no such entity. */
  exists: boolean;
  /** True for the player's own body, which is never looted. */
  isOwn: boolean;
  /** True only when the body is dead. */
  isDead: boolean;
  /** The server's id for it, or undefined if it has none yet. */
  networkId: number | undefined;
  /** Distance from the player, or null when either end is unknown. */
  distance: number | null;
}

/**
 * Dead and in reach is the whole test: the server decides if anything is
 * inside, and an empty answer closes the window. `tell` is set only where
 * silence would look broken.
 */
export function decideLoot(target: LootTarget, reach: number): LootDecision {
  if (!target.exists) return { open: false, why: 'no such body' };
  if (target.isOwn) return { open: false, why: 'own body' };
  if (!target.isDead) {
    return { open: false, why: 'not dead', networkId: target.networkId };
  }
  if (target.networkId === undefined) {
    return { open: false, why: 'body has no server id' };
  }
  if (target.distance !== null && target.distance > reach) {
    return {
      open: false,
      why: 'too far',
      networkId: target.networkId,
      distance: target.distance,
      tell: 'Too far away to loot',
    };
  }
  return { open: true, networkId: target.networkId, distance: target.distance };
}

/** Loot state recorded for every named body, resident or not, and the glow given once per body. */
export class LootGlow {
  private readonly states = new Map<number, Lootable>();
  private readonly given = new Set<number>();

  /**
   * Record a body's loot state.
   *
   * @returns whether the body should now be wearing the glow. A body that
   *   stops being worth opening loses it and may earn it again.
   */
  record(networkId: number, lootable: Lootable): boolean {
    this.states.set(networkId, lootable);
    const worth = worthOpening(lootable);
    if (!worth) this.given.delete(networkId);
    return worth;
  }

  /** Every body worth opening, for the caller to find and re-assert. */
  *openable(): Iterable<[networkId: number, lootable: Lootable]> {
    for (const [networkId, lootable] of this.states) {
      if (worthOpening(lootable)) yield [networkId, lootable];
    }
  }

  /** Claim a body's one glow; the per-frame re-assert asks only once per body. */
  claimGlow(networkId: number): boolean {
    if (this.given.has(networkId)) return false;
    this.given.add(networkId);
    return true;
  }

  /** Forget one body, which is what dropping its view means. */
  forget(networkId: number): void {
    this.states.delete(networkId);
    this.given.delete(networkId);
  }

  clear(): void {
    this.states.clear();
    this.given.clear();
  }

  /** Every recorded state, for the debug report. */
  get recorded(): ReadonlyMap<number, Lootable> {
    return this.states;
  }
}
