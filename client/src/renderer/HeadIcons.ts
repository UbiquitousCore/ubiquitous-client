/** Head icons gliding for `ICON_GLIDE_MS` when the text under them changes; pure, the caller applies heights. */
import type { EntityId } from '../world/World';
import { NAME_LABEL_ONE_LINE_PX, NAME_LABEL_PX, NAME_LABEL_WORLD_HEIGHT } from './nameLabels';

/** How many nameplate lines sit under a head icon: none, a name, or a name over a role. */
export type LinesUnderIcon = 0 | 1 | 2;

/** One line of nameplate text, glyph top to glyph bottom, in world units. */
const TEXT_LINE = NAME_LABEL_WORLD_HEIGHT * (NAME_LABEL_PX / NAME_LABEL_ONE_LINE_PX);

/**
 * From the top of whatever text is under the icon to the icon's centre.
 *
 * Half the smallest icon a body gets (0.55 across) plus a small gap, so an
 * icon never overlaps the name beneath it. Own choice.
 */
const ICON_CLEARANCE = 0.4;

/** The icon's lift over the nameplate anchor: it clears the text, half a line per line. */
export function iconLift(lines: LinesUnderIcon): number {
  return (lines * TEXT_LINE) / 2 + ICON_CLEARANCE;
}

/**
 * How long an icon glides to a new height, linearly. Own choice: about five
 * frames at 30 frames a second, short enough to read as the icon making way
 * rather than as an animation.
 */
export const ICON_GLIDE_MS = 170;

/** Height of the bob, peak to rest, in world units. Own choice: slight enough to read as idle motion. */
export const ICON_BOB_AMPLITUDE = 0.035;

/** Seconds per bob. Own choice. */
export const ICON_BOB_PERIOD_S = 1.6;

/**
 * How far above its resting height an icon is drawn at `nowMs`.
 *
 * Each body is offset by its own id so a crowd of givers does not rise and
 * fall in step.
 */
export function iconBob(nowMs: number, id: EntityId): number {
  const phase = (Number(id) % 7) * 0.9;
  return ICON_BOB_AMPLITUDE * Math.sin((nowMs / 1000 / ICON_BOB_PERIOD_S) * Math.PI * 2 + phase);
}

interface Move {
  from: number;
  to: number;
  at: number;
}

/**
 * Where a moving icon should be put, and whether it is still there to put.
 *
 * Returning false means the icon has gone — its body was dropped mid-move —
 * and the move is abandoned.
 */
export type PlaceIcon = (id: EntityId, y: number) => boolean;

export class HeadIcons {
  /**
   * At most a couple at a time — the one being selected and the one being
   * dropped — so a map rather than a pass over every view.
   */
  private readonly moving = new Map<EntityId, Move>();

  get size(): number {
    return this.moving.size;
  }

  /** Where the icon belongs over this much text, given the nameplate anchor's height. */
  static heightFor(anchorY: number, lines: LinesUnderIcon): number {
    return anchorY + iconLift(lines);
  }

  /** Begin gliding one icon from where it is to where it now belongs. */
  start(id: EntityId, fromY: number, toY: number, now: number): void {
    this.moving.set(id, { from: fromY, to: toY, at: now });
  }

  /** Abandon any move for one body, which is what dropping its view means. */
  forget(id: EntityId): void {
    this.moving.delete(id);
  }

  clear(): void {
    this.moving.clear();
  }

  /**
   * Place every moving icon at the height it has reached by `now`.
   *
   * A move whose glide has run out is dropped, as is one whose icon `place`
   * reports gone.
   */
  advance(now: number, place: PlaceIcon): void {
    if (this.moving.size === 0) return;
    for (const [id, move] of [...this.moving]) {
      const t = Math.min(1, (now - move.at) / ICON_GLIDE_MS);
      if (!place(id, move.from + (move.to - move.from) * t)) {
        this.moving.delete(id);
        continue;
      }
      if (t >= 1) this.moving.delete(id);
    }
  }
}
