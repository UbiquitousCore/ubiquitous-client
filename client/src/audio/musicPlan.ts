/**
 * The music timetable (own design): a piece plays out, a gap of
 * `GAP_MIN_MS`-`GAP_MAX_MS`, then a different piece of the set. New music
 * eases across; the same music again changes nothing. `AudioEngine` plays it.
 */

import type { SoundCue } from '../assets/formats/tables';
import { cueFile } from './cues';

/** Easing a piece in, out, or across to another, in ms. **Own choice.** */
export const EASE_MS = 2_500;
/** The quiet between one piece and the next, in ms: a random span in this range. **Own choice.** */
export const GAP_MIN_MS = 15_000;
export const GAP_MAX_MS = 45_000;

export type MusicCommand =
  /** Start this file, easing in; whatever was playing eases out. */
  | { kind: 'start'; path: string; fadeMs: number }
  /** Ease the playing piece out. */
  | { kind: 'fadeOut'; fadeMs: number }
  /** Stop everything, easing out. */
  | { kind: 'stop'; fadeMs: number };

/** Where the timetable is: nothing, a piece playing, or the quiet after one. */
type Phase =
  | { kind: 'silent' }
  | { kind: 'playing'; path: string; variant: number; leftMs: number; easing: boolean }
  | { kind: 'resting'; variant: number; leftMs: number };

export class MusicPlan {
  private music: SoundCue | null = null;
  private phase: Phase = { kind: 'silent' };

  constructor(private readonly random: () => number = Math.random) {}

  /** The music being played, or null. */
  get current(): SoundCue | null {
    return this.music;
  }

  /** Play this music. The same music again changes nothing. */
  play(cue: SoundCue): MusicCommand[] {
    if (this.music?.id === cue.id) return [];
    this.music = cue;
    return [this.begin(undefined)];
  }

  /** Stop the music. */
  stop(): MusicCommand[] {
    if (!this.music) return [];
    this.music = null;
    this.phase = { kind: 'silent' };
    return [{ kind: 'stop', fadeMs: EASE_MS }];
  }

  /** The playing file has loaded and runs this long. Until then it is not timed. */
  setDuration(path: string, durationMs: number): void {
    if (this.phase.kind === 'playing' && this.phase.path === path) this.phase.leftMs = durationMs;
  }

  /** Time passes. */
  tick(dtMs: number): MusicCommand[] {
    const phase = this.phase;
    if (!this.music || phase.kind === 'silent') return [];
    phase.leftMs -= dtMs;
    if (phase.kind === 'resting') {
      return phase.leftMs <= 0 ? [this.begin(phase.variant)] : [];
    }
    if (phase.leftMs <= 0) {
      const gap = GAP_MIN_MS + (GAP_MAX_MS - GAP_MIN_MS) * this.random();
      this.phase = { kind: 'resting', variant: phase.variant, leftMs: gap };
      return [];
    }
    if (!phase.easing && phase.leftMs <= EASE_MS) {
      phase.easing = true;
      return [{ kind: 'fadeOut', fadeMs: EASE_MS }];
    }
    return [];
  }

  /** Start a piece of the current music, other than `after` where there is a choice. */
  private begin(after: number | undefined): MusicCommand {
    const { path, variant } = cueFile(this.music!, this.random(), after);
    this.phase = { kind: 'playing', path, variant, leftMs: Infinity, easing: false };
    return { kind: 'start', path, fadeMs: EASE_MS };
  }
}
