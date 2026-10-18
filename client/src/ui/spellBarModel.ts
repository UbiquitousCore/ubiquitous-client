/** The spell bar's rules: what a slot is doing and which movie face shows it; no drawing. */

import { signal } from '@preact/signals';

import { faceFor } from './art/faceRuns';
import type { FaceRun } from './art/faceRuns';
import type { PiecePart } from './art/piecePlan';

/** How long a cooldown has to run: what is left, and what it started at, in ms. */
export interface SlotCooldown {
  remaining: number;
  total: number;
}

/**
 * The cooldown a slot shows: its spell's own, or the global one while that is
 * the longer. A two-minute cooldown must not read as ready after the global's
 * second and a half, so the longer of the two wins.
 */
export function governingCooldown(
  own: SlotCooldown | undefined,
  global: SlotCooldown | null,
): SlotCooldown | null {
  const running = [own, global ?? undefined].filter(
    (cd): cd is SlotCooldown => cd !== undefined && cd.remaining > 0,
  );
  if (!running.length) return null;
  return running.reduce((longest, cd) => (cd.remaining > longest.remaining ? cd : longest));
}

/** How much of a cooldown is still to run, from none to all of it. */
export function cooldownLeft(cd: SlotCooldown | null): number {
  if (!cd || !(cd.total > 0)) return 0;
  return Math.max(0, Math.min(1, cd.remaining / cd.total));
}

/**
 * The face of the sweep clip for a cooldown: the first face covers the slot
 * and the last clears it, so a full cooldown wears the first and the face
 * steps along as it runs out. None while nothing is cooling.
 */
export function sweepFace(cd: SlotCooldown | null, run: FaceRun): number | null {
  if (!cd || cd.remaining <= 0) return null;
  return faceFor(cooldownLeft(cd), run);
}

/** What stops a slot being used right now, if anything. */
export type SlotUse = 'ready' | 'short' | 'blocked';

/** What the hero and the spell say about whether it can be cast. */
export interface SlotUseInput {
  /** What casting it spends, or undefined while the spell's numbers are unread. */
  cost: number | undefined;
  /** What the hero has to spend. */
  power: number;
  /** True once the server says the hero is dead. */
  dead: boolean;
}

/**
 * Whether a spell can be used: `short` where the hero has less to spend than
 * it costs (the blue tint), `blocked` where the hero cannot cast at all (the
 * red tint). Own choice: the client does not know how far the target is, so
 * out-of-range is not one of the reasons.
 */
export function slotUse({ cost, power, dead }: SlotUseInput): SlotUse {
  if (dead) return 'blocked';
  if (cost !== undefined && cost > power) return 'short';
  return 'ready';
}

/**
 * The faces of the flash a slot plays when its own spell comes off cooldown,
 * and how long each is held. Own choice: thirty faces a second.
 */
export const FLASH_FACE_MS = 1000 / 30;

/** The face of a flash clip `elapsed` ms in; none once it has played out. */
export function flashFace(elapsed: number, run: FaceRun): number | null {
  if (elapsed < 0) return null;
  const face = run.first + Math.floor(elapsed / FLASH_FACE_MS);
  // The clip's last face takes the art away, which is the same as none.
  return face < run.last ? face : null;
}

/**
 * Which slots have just come off cooldown: cooling before, not now. The
 * global cooldown is not a reason to flash — every slot would, at once, after
 * every cast — so callers pass whether each slot's own spell is cooling.
 */
export function justReady(before: readonly boolean[], now: readonly boolean[]): number[] {
  const out: number[] = [];
  now.forEach((cooling, slot) => {
    if (!cooling && before[slot]) out.push(slot);
  });
  return out;
}

/** The face of the bar's own clip: the one offering to close it while open, to open it while closed. */
export function handleFace(open: boolean): number {
  return open ? 1 : 0;
}

/**
 * How far to slide the bar right when it is closed, as a share of its own
 * width: as far as the movie puts it past the edge of its screen. Open, the
 * bar stands against the edge; closed, the slots are out of sight and the
 * handle and the mount's slot are what is left.
 */
export function closedShift(onStage: { x: number; w: number }, stageWidth: number): number {
  if (!(onStage.w > 0)) return 0;
  return Math.max(0, Math.min(1, (onStage.x + onStage.w - stageWidth) / onStage.w));
}

/**
 * The least the bar is shrunk to, whatever room there is: smaller than half
 * its size and its slots are too small to press. Own choice. Past this it
 * overlaps the minimap and the jump button instead.
 */
export const LEAST_FIT = 0.5;

/**
 * How much to shrink the bar so it fits the room between the minimap and the
 * jump button: not at all while it fits.
 */
export function fitScale(room: number, needed: number): number {
  if (!(needed > 0)) return 1;
  return Math.max(LEAST_FIT, Math.min(1, room / needed));
}

/**
 * Where an open bar stands: above the jump button while it fits there at
 * full size, else over the corner at the foot of the screen, scaled to the
 * room down from the minimap, with the jump button and wheel out of its way.
 */
export function barPlacement(
  open: boolean,
  roomAbove: number,
  roomToFoot: number,
  needed: number,
): { covers: boolean; fit: number } {
  const covers = open && needed > 0 && roomAbove < needed;
  return { covers, fit: fitScale(covers ? roomToFoot : roomAbove, needed) };
}

/** True while the open bar stands over the jump button and wheel. */
export const spellBarCoversCorner = signal(false);

/** How much of the corner's height the jump button takes, in pixels, for the bar to stand above. */
export const jumpRoom = signal(0);

/**
 * Where inside a slot a spell's icon goes, as the box the slot's tint
 * covers: the circle inside the slot's rim. Given the slot and its tint as
 * measured in the same space, and the slot as it is drawn, the icon's box.
 */
export function iconBox(
  slot: PiecePart['box'],
  tint: PiecePart['box'] | undefined,
  drawn: PiecePart['box'],
): PiecePart['box'] {
  if (!tint || !(slot.w > 0) || !(slot.h > 0)) return drawn;
  return {
    x: drawn.x + ((tint.x - slot.x) / slot.w) * drawn.w,
    y: drawn.y + ((tint.y - slot.y) / slot.h) * drawn.h,
    w: (tint.w / slot.w) * drawn.w,
    h: (tint.h / slot.h) * drawn.h,
  };
}

/** Whether the bar is out on the screen's edge. */
export const spellBarOpen = signal(true);

/** Slide the bar out or away. */
export function setSpellBarOpen(open: boolean): void {
  spellBarOpen.value = open;
}

/** Where one slot's parts are, by path. */
export interface SlotRef {
  /** The slot's place on the bar: its number in the run, from zero; the mount's is after the run. */
  index: number;
  /** The slot itself. */
  path: string;
  /** The empty-slot art and the flash beside it, which sit in the slot's holder. */
  resting: string;
  flash: string;
  /** What lies inside the slot. */
  sweep: string;
  unusable: string;
  short: string;
  lit: string;
}

/** The names the screen spec gives what lies in and beside a slot. */
export interface SlotNames {
  slot: string;
  within: string;
  mount?: string;
  sweep: string;
  unusable: string;
  short: string;
  lit: string;
  resting: string;
  flash: string;
}

/** Every slot in assignment order (the run, then the mount); rest-art and flash numbered like the slot. */
export function slotRefs(parts: readonly PiecePart[], names: SlotNames): SlotRef[] {
  const run = new RegExp(`^${names.within}/${names.slot}(\\d+)$`);
  const found = parts
    .map(part => ({ path: part.path, number: run.exec(part.path)?.[1] }))
    .filter((one): one is { path: string; number: string } => one.number !== undefined)
    .sort((a, b) => Number(a.number) - Number(b.number));
  const refs: SlotRef[] = found.map((one, index) =>
    ref(one.path, names.within, one.number, index, names),
  );
  if (names.mount && parts.some(part => part.path === names.mount)) {
    const holder = names.mount.slice(0, names.mount.lastIndexOf('/'));
    const next = String((found.length ? Number(found[found.length - 1]!.number) : 0) + 1).padStart(
      2,
      '0',
    );
    refs.push(ref(names.mount, holder, next, refs.length, names));
  }
  return refs;
}

function ref(path: string, holder: string, number: string, index: number, n: SlotNames): SlotRef {
  return {
    index,
    path,
    resting: `${holder}/${n.resting}${number}`,
    flash: `${holder}/${n.flash}${number}`,
    sweep: `${path}/${n.sweep}`,
    unusable: `${path}/${n.unusable}`,
    short: `${path}/${n.short}`,
    lit: `${path}/${n.lit}`,
  };
}

/** What one slot is doing, as far as its art is concerned. */
export interface SlotView {
  /** Whether a spell is in the slot. */
  filled: boolean;
  /** True while a finger or button is held on the slot. */
  pressed: boolean;
  /** The face of the sweep, while the slot is cooling. */
  sweep: number | null;
  use: SlotUse;
  /** True while the slot is the one being cast, or the one a dragged spell is over. */
  lit: boolean;
  /** The face of the flash, while one is playing. */
  flash: number | null;
}

/** The base (dialog without swirls and flashes) and the overlay of parts that are on, drawn over the icons. */
export function spellBarStates(
  refs: readonly SlotRef[],
  views: readonly SlotView[],
  handle: { dialog: string; open: boolean },
): {
  base: { hidden: string[]; frames: Record<string, number> };
  over: { only: string[]; driven: string[]; frames: Record<string, number> };
} {
  const base = { hidden: [] as string[], frames: { [handle.dialog]: handleFace(handle.open) } };
  const over = {
    only: [] as string[],
    driven: [] as string[],
    frames: {} as Record<string, number>,
  };
  refs.forEach(slot => {
    const view = views[slot.index];
    base.hidden.push(slot.resting, slot.flash);
    if (!view) return;
    if (view.pressed) over.only.push(slot.resting);
    if (view.sweep !== null) {
      over.only.push(slot.sweep);
      over.driven.push(slot.sweep);
      over.frames[slot.sweep] = view.sweep;
    }
    if (view.filled && view.use === 'blocked') {
      over.only.push(slot.unusable);
      over.driven.push(slot.unusable);
    }
    if (view.filled && view.use === 'short') {
      over.only.push(slot.short);
      over.driven.push(slot.short);
    }
    if (view.lit) {
      over.only.push(slot.lit);
      over.driven.push(slot.lit);
    }
    if (view.flash !== null) {
      over.only.push(slot.flash);
      over.frames[slot.flash] = view.flash;
    }
  });
  return { base, over };
}
