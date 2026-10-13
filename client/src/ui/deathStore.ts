/**
 * The dead hero's prompt. The dead flag is server-owned (`unit.died` sets it,
 * `player.revived` clears it); reviving is a request — the prompt goes when the
 * server answers, not when the button is pressed.
 */

import { computed, signal } from '@preact/signals';

import { player } from './hudStore';

/** Whether the hero is down: the one fact the death dialog hangs off. */
export const playerDead = computed(() => player.value?.dead === true);

/** Last death toll in copper + killer (private to the hero; null until one
 * arrives; zero penalty is a real answer; cleared on revival). */
export interface DeathToll {
  deathCost: number;
  killerName?: string;
}

export const deathToll = signal<DeathToll | null>(null);

export function setDeathToll(toll: DeathToll | null): void {
  deathToll.value = toll;
}

// ---------------------------------------------------------------------------
// What the prompt asks the game to do: a handler defaulting to nothing.
// ---------------------------------------------------------------------------
export interface DeathActions {
  /**
   * The free choice: come back at the nearest graveyard.
   *
   * Reached through `player.unstuck`, the only request this project has that
   * clears the dead flag.
   */
  reviveAtCemetery(): void;
}

const NOTHING: DeathActions = {
  reviveAtCemetery: () => {},
};

let actions: DeathActions = NOTHING;

export function setDeathActions(next: DeathActions): void {
  actions = next;
}

export function deathActions(): DeathActions {
  return actions;
}
