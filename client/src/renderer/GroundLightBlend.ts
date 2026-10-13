/**
 * The ground's sun and shade colours across a zone border: the first zone's
 * show at once, a later zone's fade in from what is on screen.
 */

type Rgb = readonly [number, number, number];

/** How long the ground's light takes to fade into a new zone's. Observed in play by the owner: about a second. */
export const GROUND_BLEND_MS = 1000;

const WHITE: Rgb = [1, 1, 1];

/** Zero at the start of a fade, one at the end, flat at both ends. */
function ease(fraction: number): number {
  const t = Math.min(1, Math.max(0, fraction));
  return t * t * (3 - 2 * t);
}

function mix(from: Rgb, to: Rgb, t: number): Rgb {
  return [
    from[0] + (to[0] - from[0]) * t,
    from[1] + (to[1] - from[1]) * t,
    from[2] + (to[2] - from[2]) * t,
  ];
}

export class GroundLightBlend {
  private from = { sun: WHITE, shade: WHITE };
  private to = { sun: WHITE, shade: WHITE };
  private shown = { sun: WHITE, shade: WHITE };
  private at = GROUND_BLEND_MS;
  private hasZone = false;

  /** The colours on the ground now. */
  get current(): { sun: Rgb; shade: Rgb } {
    return this.shown;
  }

  /** Take on a zone's colours; white where it sets none. */
  adopt(sun: Rgb = WHITE, shade: Rgb = WHITE): void {
    this.to = { sun, shade };
    if (!this.hasZone) {
      this.hasZone = true;
      this.from = this.shown = this.to;
      this.at = GROUND_BLEND_MS;
      return;
    }
    this.from = this.shown;
    this.at = 0;
  }

  /** Advance by `dtMs`; true while the colours on the ground are still changing. */
  step(dtMs: number): boolean {
    if (this.at >= GROUND_BLEND_MS) return false;
    this.at = Math.min(GROUND_BLEND_MS, this.at + dtMs);
    const t = ease(this.at / GROUND_BLEND_MS);
    this.shown = {
      sun: mix(this.from.sun, this.to.sun, t),
      shade: mix(this.from.shade, this.to.shade, t),
    };
    return true;
  }
}
