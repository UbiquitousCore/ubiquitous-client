/**
 * A zone's fog as numbers: reach at the current draw distance and blending
 * between targets. The caller writes the scene and knows about water.
 * World units; linear RGB.
 */

import * as THREE from 'three';

import type { ZoneAtmosphere } from '../assets/types';
import { clampFog, DEFAULT_FOG } from '../core/graphics';

/**
 * A zone fog whose far end lies at least this far out is haze over open
 * ground. Anything shorter is murk — a cave, a crypt — and keeps its own
 * distances whatever the draw distance.
 */
export const HAZE_MIN_FAR = 60;

/**
 * How much of the gap between a haze's own far end and the draw distance it
 * is pushed across at the lightest fog setting. Short of one, so the last
 * stretch before models stop being drawn is always fully fogged and nothing
 * is seen to pop out.
 */
export const LIGHTEST_REACH = 0.9;

/** How much of that gap the haze is pushed across at fog setting `fog` (`DEFAULT_FOG`). */
export function hazeReach(fog: number): number {
  return LIGHTEST_REACH * (1 - clampFog(fog));
}

/** How long the fog takes to blend into a new zone's, or back out of the water. */
export const ZONE_BLEND_MS = 1500;

/** How long the fog takes to close in when the camera goes under water. */
export const SUBMERGE_BLEND_MS = 300;

/** The murk the camera sees under water. */
export const UNDERWATER_COLOR = new THREE.Color(0.05, 0.2, 0.28);
export const UNDERWATER_NEAR = 0.5;
export const UNDERWATER_FAR = 40;

/** What to draw: a colour and the two distances it runs between. */
export interface FogValues {
  color: THREE.Color;
  near: number;
  far: number;
}

/** The far end a zone's fog is drawn to at a given draw distance. */
export function reachFor(
  zoneNear: number,
  zoneFar: number,
  drawDistance: number,
  fog = DEFAULT_FOG,
): number {
  if (zoneFar < HAZE_MIN_FAR || zoneFar >= drawDistance) return zoneFar;
  return Math.max(zoneNear, zoneFar + (drawDistance - zoneFar) * hazeReach(fog));
}

/** Zero at the start of a blend, one at the end, flat at both ends. */
function ease(fraction: number): number {
  const t = Math.min(1, Math.max(0, fraction));
  return t * t * (3 - 2 * t);
}

function copyOf(values: FogValues): FogValues {
  return { color: values.color.clone(), near: values.near, far: values.far };
}

function assign(into: FogValues, from: FogValues): void {
  into.color.copy(from.color);
  into.near = from.near;
  into.far = from.far;
}

const UNDERWATER: FogValues = {
  color: UNDERWATER_COLOR,
  near: UNDERWATER_NEAR,
  far: UNDERWATER_FAR,
};

export class ZoneFog {
  /** The current zone's fog at the current draw distance. */
  private readonly zone: FogValues = { color: new THREE.Color(), near: 0, far: 1 };

  /** What was on screen when the current blend began. */
  private readonly start: FogValues = { color: new THREE.Color(), near: 0, far: 1 };

  /** What is on screen now. */
  private readonly shown: FogValues = { color: new THREE.Color(), near: 0, far: 1 };

  private hasZone = false;
  private submerged = false;

  /** Milliseconds into the current blend, and how long it lasts. */
  private blendAt = 0;
  private blendLength = ZONE_BLEND_MS;

  /** Whether a zone has been adopted, so there is any fog to draw at all. */
  get ready(): boolean {
    return this.hasZone;
  }

  /** The fog on screen right now. */
  get current(): FogValues {
    return copyOf(this.shown);
  }

  /**
   * Take on a zone's weather; null when it has no fog (near equal to far
   * would fog everything solid). The first zone shows at once, later ones
   * blend from what is on screen; under water the change waits.
   */
  adopt(atmos: ZoneAtmosphere, drawDistance: number, fog = DEFAULT_FOG): FogValues | null {
    if (atmos.fogNear === 0 && atmos.fogFar === 0) return null;

    this.zone.color.setRGB(...atmos.fogColor, THREE.SRGBColorSpace);
    this.zone.near = atmos.fogNear;
    this.zone.far = reachFor(atmos.fogNear, atmos.fogFar, drawDistance, fog);

    if (!this.hasZone) {
      this.hasZone = true;
      assign(this.start, this.zone);
      assign(this.shown, this.zone);
      this.blendAt = this.blendLength;
    } else if (!this.submerged) {
      this.beginBlend(ZONE_BLEND_MS);
    }
    return copyOf(this.zone);
  }

  /**
   * Advance one frame and return the fog to draw, or null before any zone.
   *
   * Going under water starts a short blend toward the underwater murk;
   * coming up starts the zone-length blend back to the zone's own fog.
   */
  step(dt: number, underwater: boolean): FogValues | null {
    if (!this.hasZone) return null;

    if (underwater !== this.submerged) {
      this.submerged = underwater;
      this.beginBlend(underwater ? SUBMERGE_BLEND_MS : ZONE_BLEND_MS);
    }

    this.blendAt += dt * 1000;
    const t = ease(this.blendAt / this.blendLength);
    const target = this.submerged ? UNDERWATER : this.zone;

    this.shown.color.copy(this.start.color).lerp(target.color, t);
    this.shown.near = THREE.MathUtils.lerp(this.start.near, target.near, t);
    this.shown.far = THREE.MathUtils.lerp(this.start.far, target.far, t);
    return copyOf(this.shown);
  }

  private beginBlend(lengthMs: number): void {
    assign(this.start, this.shown);
    this.blendAt = 0;
    this.blendLength = lengthMs;
  }
}
