/**
 * Bars as runs of a clip's faces (read from the files: one run per fill
 * colour, starting where the fill art changes; a lone different face is a
 * cap, not a run). Own choice: round to the nearest face, but never show
 * full or empty unless exactly so.
 */

import type { UiSkinData } from '../../assets/types';

/** A stretch of a clip's faces that shows one bar from end to end. */
export interface FaceRun {
  first: number;
  last: number;
}

/** Which end of a run shows the bar full. */
export type FullEnd = 'first' | 'last';

/** How much of `max` there is, held between none and all; none against nothing. */
export function shareOf(current: number, max: number): number {
  if (!(max > 0) || !Number.isFinite(current)) return 0;
  return Math.min(1, Math.max(0, current / max));
}

/** The face of `run` a bar wears with `share` of it filled. */
export function faceFor(share: number, run: FaceRun, full: FullEnd = 'first'): number {
  const steps = run.last - run.first;
  const held = Number.isNaN(share) ? 0 : Math.min(1, Math.max(0, share));
  let filled = Math.round(held * steps);
  if (steps >= 2 && held > 0 && held < 1) filled = Math.min(steps - 1, Math.max(1, filled));
  return full === 'first' ? run.last - filled : run.first + filled;
}

/**
 * The art a character stands for: a one-face clip holding a single piece is
 * that piece, however deep the wrapping goes.
 */
function artOf(skin: UiSkinData, id: number): number {
  const seen = new Set<number>();
  let at = id;
  for (;;) {
    if (seen.has(at)) return at;
    seen.add(at);
    const clip = skin.sprites.find(sprite => sprite.id === at);
    const inner = clip?.frameCount === 1 ? clip.frames[0] : undefined;
    const only = inner?.length === 1 ? inner[0]!.characterId : null;
    if (only == null || only < 0) return at;
    at = only;
  }
}

/** The runs a clip's faces fall into; none for anything but a clip of more than one face. */
export function runsOf(skin: UiSkinData, barClip: number): FaceRun[] {
  const clip = skin.sprites.find(sprite => sprite.id === barClip);
  if (!clip || clip.frameCount < 2) return [];
  const artAt = new Map<number, number>();
  const starts = [0];
  for (let face = 0; face < clip.frameCount; face++) {
    for (const placed of clip.frames[face] ?? []) {
      // A move carries no character, a removal a negative one, and a mask
      // is the window the fill shows through rather than the fill.
      if (placed.characterId == null || placed.characterId < 0 || placed.clipDepth) continue;
      const art = artOf(skin, placed.characterId);
      const before = artAt.get(placed.depth);
      artAt.set(placed.depth, art);
      // Art that is new to a depth already showing some starts a run; art
      // taken away and put back is the same run.
      if (before !== undefined && before !== art && starts[starts.length - 1] !== face)
        starts.push(face);
    }
  }
  const runs = starts.map((first, at) => ({
    first,
    last: (starts[at + 1] ?? clip.frameCount) - 1,
  }));
  // A single face of new art is the end of the run before it, not a run:
  // some clips put a cap of their own on the empty face.
  return runs.filter((run, at) => {
    if (at === 0 || run.last > run.first) return true;
    runs[at - 1]!.last = run.last;
    return false;
  });
}

/**
 * Run `which` of the bar at `path`, from a screen's bars: its first run where
 * it has no such run, and the length the screen's bars share where the clip
 * was not read at all.
 */
export function barRun(
  bars: { frames: number; runs?: Record<string, readonly FaceRun[]> },
  path: string,
  which = 0,
): FaceRun {
  const runs = bars.runs?.[path];
  return runs?.[which] ?? runs?.[0] ?? { first: 0, last: bars.frames };
}
