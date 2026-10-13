/** Whether this session is inside an instance, inferred: set when asked for, cleared by any other world entry. */

import { computed, signal } from '@preact/signals';

import type { DungeonMode } from '../net/GameConnection';

/** The map this session is in a private copy of, or null for the open world. */
export const instanceMapId = signal<number | null>(null);

/** Whether this session believes it is inside an instance. Inferred — see above. */
export const inInstance = computed(() => instanceMapId.value !== null);

/**
 * The dungeon mode this player's team runs, as the server last confirmed it.
 * Every team starts in Normal; only the server's answer changes it.
 */
export const dungeonMode = signal<DungeonMode>('normal');

/** Recorded, not applied: only the following world entry confirms it. */
let awaiting: number | null = null;

export function noteInstanceRequested(mapId: number): void {
  awaiting = mapId;
}

/** Called on every world entry: teleports, buses and relogs leave instances silently too. */
export function applyWorldEntered(mapId: number): void {
  if (awaiting !== null && awaiting === mapId) {
    instanceMapId.value = mapId;
  } else if (instanceMapId.value !== null) {
    instanceMapId.value = null;
  }
  awaiting = null;
}

/** Forget everything. Nothing about an instance survives a disconnect. */
export function resetInstance(): void {
  awaiting = null;
  instanceMapId.value = null;
  dungeonMode.value = 'normal';
}

// ---------------------------------------------------------------------------
// What the window asks the game to do
// ---------------------------------------------------------------------------

export interface InstanceActions {
  /** Enter this session's copy of a map; no position asks for the server's default. The party leader decides the copy. */
  enter(mapId: number, position?: [number, number, number], yaw?: number): void;
  /**
   * End every dungeon copy this player owns — the team's, when they lead
   * one — so the next visit starts the run over. Refused while anyone is
   * still inside one.
   */
  resetDungeons(): void;
  /**
   * Run every dungeon this player owns in Normal or Legend. Changing it ends
   * their copies, as a reset does, so it is refused while anyone is inside.
   */
  chooseDungeonMode(mode: DungeonMode): void;
}

const NOTHING: InstanceActions = {
  enter: () => {},
  resetDungeons: () => {},
  chooseDungeonMode: () => {},
};

let actions: InstanceActions = NOTHING;

export function setInstanceActions(next: InstanceActions): void {
  actions = next;
}

export function instanceActions(): InstanceActions {
  return actions;
}
