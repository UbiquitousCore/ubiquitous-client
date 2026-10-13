/**
 * The rules the spell ring draws and turns by.
 *
 * Plain functions over numbers and part paths, with no drawing in them.
 * `ArtSpellWheel` reads the game's signals, asks these, and turns the movie's
 * parts to the faces they return.
 */

import type { PiecePart } from './art/piecePlan';

/** Where one ring slot's parts are, by path. */
export interface WheelRef {
  /** The slot's place on the ring, from zero. */
  index: number;
  path: string;
  /** The sweep a cooldown runs through, inside the slot. */
  sweep: string;
  /** The effects held beside the slot. */
  effects: string;
  /** The flash when a cooldown ends, and the glow of a press. */
  flash: string;
  glow: string;
}

/** The names the screen spec gives the ring's parts. */
export interface WheelNames {
  slot: string;
  within: string;
  sweep: string;
  effects: string;
  flash: string;
  glow: string;
}

/** Every slot of the ring, in the order of the numbers in their names. */
export function wheelRefs(parts: readonly PiecePart[], names: WheelNames): WheelRef[] {
  const run = new RegExp(`^${names.within}/${names.slot}(\\d+)$`);
  return parts
    .map(part => ({ path: part.path, number: run.exec(part.path)?.[1] }))
    .filter((one): one is { path: string; number: string } => one.number !== undefined)
    .sort((a, b) => Number(a.number) - Number(b.number))
    .map((one, index) => {
      const effects = `${names.within}/${names.effects}${one.number}`;
      return {
        index,
        path: one.path,
        sweep: `${one.path}/${names.sweep}`,
        effects,
        flash: `${effects}/${names.flash}`,
        glow: `${effects}/${names.glow}`,
      };
    });
}

/** What one ring slot is doing, as far as its art is concerned. */
export interface WheelView {
  /** The face of the sweep, while the slot is cooling. */
  sweep: number | null;
  /** True while the slot is held down or its spell is being cast. */
  glowing: boolean;
  /** The face of the flash, while one is playing. */
  flash: number | null;
}

/**
 * What to draw of the dialog under the icons, and of the parts that go over
 * them: the base has every slot's sweep, glow and flash left out — the disc a
 * slot stands on is the effects' own art — and the overlay only the ones that
 * are on.
 */
export function wheelStates(
  refs: readonly WheelRef[],
  views: readonly WheelView[],
  hidden: readonly string[],
): {
  base: { hidden: string[] };
  over: { only: string[]; driven: string[]; frames: Record<string, number> };
} {
  const base = { hidden: [...hidden] };
  const over = {
    only: [] as string[],
    driven: [] as string[],
    frames: {} as Record<string, number>,
  };
  for (const slot of refs) {
    base.hidden.push(slot.sweep, slot.glow, slot.flash);
    const view = views[slot.index];
    if (!view) continue;
    if (view.sweep !== null) {
      over.only.push(slot.sweep);
      over.frames[slot.sweep] = view.sweep;
    }
    if (view.glowing) over.only.push(slot.glow);
    if (view.flash !== null) {
      over.only.push(slot.flash);
      over.frames[slot.flash] = view.flash;
    }
  }
  return { base, over };
}

/** The point the ring turns about: the middle of its slots' boxes. */
export function ringCentre(boxes: ReadonlyArray<PiecePart['box']>): { x: number; y: number } {
  if (!boxes.length) return { x: 0, y: 0 };
  const sum = boxes.reduce(
    (at, box) => ({ x: at.x + box.x + box.w / 2, y: at.y + box.y + box.h / 2 }),
    { x: 0, y: 0 },
  );
  return { x: sum.x / boxes.length, y: sum.y / boxes.length };
}

/** How far a pointer has gone round a centre between two points, in radians, the short way. */
export function turnBetween(
  centre: { x: number; y: number },
  from: { x: number; y: number },
  to: { x: number; y: number },
): number {
  let turn =
    Math.atan2(to.y - centre.y, to.x - centre.x) - Math.atan2(from.y - centre.y, from.x - centre.x);
  while (turn > Math.PI) turn -= Math.PI * 2;
  while (turn < -Math.PI) turn += Math.PI * 2;
  return turn;
}

/** The turn nearest `angle` that stands a slot where a slot stood, for a ring of `count`. */
export function snapTurn(angle: number, count: number): number {
  const step = (Math.PI * 2) / count;
  return Math.round(angle / step) * step;
}

/** How far a pointer must move before a press on a slot is a turn of the ring, in pixels. Own choice. */
export const TURN_SLACK = 8;
