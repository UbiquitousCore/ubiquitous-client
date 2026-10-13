/**
 * The rules one sound plays by: which of its numbered files, at what pitch,
 * how loud at a distance, and whether its bank has room for it.
 *
 * Plain functions over plain values, so each rule is tested on its own and
 * `AudioEngine` is left holding only the Web Audio plumbing.
 */

import type { SoundBankRow, SoundCatalogue, SoundCue } from '../assets/formats/tables';

/** A file name with no extension is a `.wav`: a few rows leave it off. */
export function withExtension(path: string): string {
  return path.lastIndexOf('.') > path.lastIndexOf('/') ? path : `${path}.wav`;
}

/**
 * A sound with variants names its first file, `…_1.wav`; the others are the
 * same name with the number after the last underscore changed. Variant `n`
 * counts from 1.
 */
export function variantPath(path: string, n: number): string {
  const full = withExtension(path);
  const dot = full.lastIndexOf('.');
  const stem = full.slice(0, dot);
  const under = stem.lastIndexOf('_');
  if (under < 0) return full;
  return `${stem.slice(0, under + 1)}${n}${full.slice(dot)}`;
}

/**
 * One of `variants` files, evenly, from `rand` in [0, 1). With `avoid`
 * given and another file to choose, the pick is made among the others only,
 * so music never plays the same piece twice running when it has another.
 */
export function pickVariant(variants: number, rand: number, avoid?: number): number {
  if (variants <= 1) return 1;
  const others = avoid !== undefined && avoid >= 1 && avoid <= variants;
  const choices = others ? variants - 1 : variants;
  const index = Math.min(choices - 1, Math.floor(rand * choices));
  // Counting past the avoided one skips it.
  return others && index + 1 >= avoid ? index + 2 : index + 1;
}

/** The file one play of `cue` uses. */
export function cueFile(
  cue: SoundCue,
  rand: number,
  avoid?: number,
): { path: string; variant: number } {
  if (cue.variants <= 1) return { path: withExtension(cue.path), variant: 1 };
  const variant = pickVariant(cue.variants, rand, avoid);
  return { path: variantPath(cue.path, variant), variant };
}

/**
 * The files to try for one play, the picked one first. Some families skip
 * a number — the second and third shipped, the first not — so a pick that
 * is not in the pack falls through to its siblings, the next number up
 * first, including one past the count the row gives.
 */
export function cueFiles(cue: SoundCue, rand: number): string[] {
  const first = cueFile(cue, rand);
  if (cue.variants <= 1) return [first.path];
  const out = [first.path];
  for (let step = 1; step <= cue.variants; step++) {
    out.push(variantPath(cue.path, ((first.variant - 1 + step) % (cue.variants + 1)) + 1));
  }
  return [...new Set(out)];
}

/**
 * How far either side of its own pitch a sound marked to vary is played,
 * as a share. **Own choice**, small enough that a voice stays itself.
 */
export const PITCH_SPREAD = 0.05;

/** The playback rate for one play, from `rand` in [0, 1). */
export function pitchFor(cue: SoundCue, rand: number): number {
  return cue.pitched ? 1 + PITCH_SPREAD * (rand * 2 - 1) : 1;
}

/**
 * How far a sound in the world carries, in world units: a one-shot further
 * away than this is not started. The tables' two distance columns are empty
 * in every build read. **Own choice**, about the width of a town square.
 */
export const REACH = 25;

/** How far one sound carries: its own row's figure where it gives one, else `REACH`. */
export function reachOf(cue: Pick<SoundCue, 'reach'>): number {
  return cue.reach > 0 ? cue.reach : REACH;
}

/** Within this many units a sound in the world is heard at its full volume. **Own choice**. */
export const FULL_WITHIN = 3;

/**
 * How steeply a sound in the world quietens past `FULL_WITHIN`: its volume
 * goes as (distance / `FULL_WITHIN`) to the minus this. At 1.5 a sound is
 * at about half at 5 units, a sixth at 10, and a twentieth at 20, so a
 * fight across a field is a murmur rather than at the hero's elbow.
 * **Own choice**, by ear.
 */
export const FALLOFF = 1.5;

/**
 * How a panner quietens one sound with distance, in Web Audio's own
 * exponential model: full volume within `FULL_WITHIN`, falling by
 * `FALLOFF`, and no quieter than it is at the sound's reach.
 */
export function pannerFalloff(cue: Pick<SoundCue, 'reach'>): {
  distanceModel: DistanceModelType;
  refDistance: number;
  maxDistance: number;
  rolloffFactor: number;
} {
  return {
    distanceModel: 'exponential',
    refDistance: FULL_WITHIN,
    maxDistance: reachOf(cue),
    rolloffFactor: FALLOFF,
  };
}

/**
 * Should a sound this far away be started? A one-shot out of reach would be
 * silent from start to finish, so it is not started at all; a loop always
 * is, since the listener may walk up to it.
 */
export function withinEarshot(distance: number, cue: Pick<SoundCue, 'reach' | 'loop'>): boolean {
  return cue.loop || distance < reachOf(cue);
}

/**
 * Whether a bank already playing `playing` sounds has room for another. A
 * full bank makes room by stopping its oldest sound (**own choice**: the
 * newest thing to happen is the one worth hearing). No bank, or one of
 * capacity 0, never limits.
 */
export function bankIsFull(bank: SoundBankRow | undefined, playing: number): boolean {
  return bank !== undefined && bank.capacity > 0 && playing >= bank.capacity;
}

/** The catalogue indexed for play: by id, and by file name without folder or extension. */
export interface CueIndex {
  byId: Map<number, SoundCue>;
  byName: Map<string, SoundCue>;
  banks: Map<number, SoundBankRow>;
  battleMusic: Map<number, number>;
}

export function indexCatalogue(catalogue: SoundCatalogue): CueIndex {
  const byId = new Map<number, SoundCue>();
  const byName = new Map<string, SoundCue>();
  for (const cue of catalogue.cues) {
    byId.set(cue.id, cue);
    const name = soundName(cue.path);
    // Several rows can share a file; the first is the one a name finds.
    if (!byName.has(name)) byName.set(name, cue);
  }
  return {
    byId,
    byName,
    banks: new Map(catalogue.banks.map(b => [b.id, b])),
    battleMusic: new Map(catalogue.battleMusic),
  };
}

/** `sound/sfx_ui_quest_accept.wav` → `sfx_ui_quest_accept`. */
export function soundName(path: string): string {
  const base = path.split('/').pop() ?? path;
  return base.replace(/\.[^.]*$/, '').toLowerCase();
}
