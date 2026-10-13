/** Following a player, client-side only: steered each frame, stopped by the stick, the body leaving, or a stop. */

import { signal } from '@preact/signals';

export interface Following {
  /** The local entity id being followed, as a string — the HUD's own id shape. */
  unitId: string;
}

export const following = signal<Following | null>(null);

export function setFollowing(next: Following | null): void {
  following.value = next;
}

export interface FollowActions {
  /** Start (or, on whoever is already followed, stop) following the HUD's
   * current target — the toggle the target toolbar's follow slot is. */
  toggleTarget(): void;
}

const NOTHING: FollowActions = {
  toggleTarget: () => {},
};

let actions: FollowActions = NOTHING;

export function setFollowActions(next: FollowActions): void {
  actions = next;
}

export function followActions(): FollowActions {
  return actions;
}
