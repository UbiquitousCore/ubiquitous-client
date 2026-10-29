/** Third-person orbit camera; gameplay changes yaw, pitch and zoom, the rig reports orientation. */

import * as THREE from 'three';
import { uncoveredCentre } from './viewCentre';
import type { ViewCover } from './viewCentre';

const MIN_PITCH = 0.05;
const MAX_PITCH = 1.25;
const MIN_DISTANCE = 0;

/** Own choice: nearer than this the camera is inside the hero's head, which is first person. */
const FIRST_PERSON_BELOW = 0.5;

/**
 * Own choice: in first person the orbit pitch is measured from here, so the
 * view can look below the horizon as well as above it.
 */
const FIRST_PERSON_PITCH_ORIGIN = 0.6;
/** Own choice: far enough to see the surroundings, close enough to stay inside the fog and the drawn world. */
export const MAX_DISTANCE = 40;

/** Gap kept from obstructions: it must clear the 0.5 near plane, or walls clip. */
const OBSTRUCTION_GAP = 0.6;

/** Never pull closer than this, however tight the space. */
const MIN_OBSTRUCTED = 0.7;

/**
 * How fast the camera is allowed back out once the way is clear, per update.
 * Slow enough not to snap, fast enough to have recovered by the time you have
 * walked through a doorway.
 */
const RECOVER_PER_UPDATE = 0.35;

/** Share of the remaining view shift per update: done well inside the window's 180 ms slide. */
const VIEW_SHIFT_PER_UPDATE = 0.65;

/** Closer than this to the wanted centre, in pixels, and it is there. */
const VIEW_SHIFT_SNAP_PX = 0.5;

/**
 * Distance from `a` to the first solid thing between it and `b`, or null.
 * Supplied by gameplay; the rig has no idea what the world is made of.
 */
export type ObstructionProbe = (
  a: [number, number, number],
  b: [number, number, number],
) => number | null;

export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;

  /** Point the camera orbits — usually the player's head. */
  readonly target = new THREE.Vector3();

  private yaw = 0;
  private pitch = 0.4;
  /** What the player asked for with the wheel. */
  private distance = 14;
  /** What the world allows right now; <= `distance`. */
  private allowedDistance = 14;
  private probe: ObstructionProbe | null = null;

  /** The canvas, in CSS pixels, and where on it the hero should sit. */
  private viewWidth = 1;
  private viewHeight = 1;
  private wantedCentre = { x: 0.5, y: 0.5 };
  /** Where the projection centre is now; eased toward `wantedCentre`. */
  private centre = { x: 0.5, y: 0.5 };
  /** The cover last given, so an unchanged frame recomputes nothing. */
  private lastCover: ViewCover | null | undefined;

  constructor() {
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.5, 4000);
  }

  /** Keep the hero centred in the uncovered view with an off-centre frustum; nothing stretches. */
  setView(width: number, height: number, cover: ViewCover | null): void {
    const resized = width !== this.viewWidth || height !== this.viewHeight;
    if (!resized && cover === this.lastCover) return;
    this.lastCover = cover;
    if (resized) {
      // Keep the eased centre at the same fraction of the canvas across a
      // resize, so the view does not lurch when the window changes size.
      this.centre.x = (this.centre.x / this.viewWidth) * width;
      this.centre.y = (this.centre.y / this.viewHeight) * height;
      this.viewWidth = width;
      this.viewHeight = height;
    }
    this.wantedCentre = uncoveredCentre(cover, width, height);
    if (resized) this.applyView();
  }

  /** Ease the projection centre toward where it is wanted. */
  private settleView(): void {
    const dx = this.wantedCentre.x - this.centre.x;
    const dy = this.wantedCentre.y - this.centre.y;
    if (dx === 0 && dy === 0) return;
    if (Math.abs(dx) < VIEW_SHIFT_SNAP_PX && Math.abs(dy) < VIEW_SHIFT_SNAP_PX) {
      this.centre.x = this.wantedCentre.x;
      this.centre.y = this.wantedCentre.y;
    } else {
      this.centre.x += dx * VIEW_SHIFT_PER_UPDATE;
      this.centre.y += dy * VIEW_SHIFT_PER_UPDATE;
    }
    this.applyView();
  }

  private applyView(): void {
    const w = this.viewWidth;
    const h = this.viewHeight;
    const offX = w / 2 - this.centre.x;
    const offY = h / 2 - this.centre.y;
    if (offX === 0 && offY === 0) {
      this.camera.aspect = w / h;
      if (this.camera.view?.enabled) this.camera.clearViewOffset();
      else this.camera.updateProjectionMatrix();
      return;
    }
    // Render the canvas as the sub-rectangle of a same-sized frame that
    // starts `off` in: the frame's centre then lands at `centre`.
    this.camera.setViewOffset(w, h, offX, offY, w, h);
  }

  orbit(dYaw: number, dPitch: number): void {
    // Up and down are inverted in first person: dragging up looks up, where
    // the boom behind the hero swings down. Sideways, dragging left looks left
    // under either camera.
    this.yaw += dYaw;
    this.pitch = clamp(this.pitch + dPitch * (this.firstPerson ? -1 : 1), MIN_PITCH, MAX_PITCH);
  }

  /** Radians above the target; swimming pitches by it to dive. */
  elevation(): number {
    return this.pitch;
  }

  zoom(delta: number): void {
    this.distance = clamp(this.distance + delta, MIN_DISTANCE, MAX_DISTANCE);
  }

  /** Whether the camera has come in to the hero's eyes. */
  get firstPerson(): boolean {
    return this.allowedDistance < FIRST_PERSON_BELOW;
  }

  /** Yaw the camera is looking along, for aligning movement to the view. */
  get viewYaw(): number {
    return this.yaw;
  }

  /** Unit forward direction on the XZ plane. */
  forward(out: THREE.Vector2 = new THREE.Vector2()): THREE.Vector2 {
    return out.set(-Math.sin(this.yaw), -Math.cos(this.yaw));
  }

  /** Unit right direction on the XZ plane. */
  right(out: THREE.Vector2 = new THREE.Vector2()): THREE.Vector2 {
    return out.set(Math.cos(this.yaw), -Math.sin(this.yaw));
  }

  /** What stops the camera; a callback, since the renderer may not reach into the world. */
  setObstructionProbe(probe: ObstructionProbe | null): void {
    this.probe = probe;
  }

  /** Place the camera behind the target at the current orbit angles. */
  update(): void {
    this.settleView();
    // Where the player's zoom wants it.
    const dirX = Math.sin(this.yaw) * Math.cos(this.pitch);
    const dirY = Math.sin(this.pitch);
    const dirZ = Math.cos(this.yaw) * Math.cos(this.pitch);

    let allowed = this.distance;
    if (this.probe) {
      const to: [number, number, number] = [
        this.target.x + dirX * this.distance,
        this.target.y + dirY * this.distance,
        this.target.z + dirZ * this.distance,
      ];
      const hit = this.probe([this.target.x, this.target.y, this.target.z], to);
      if (hit !== null) {
        allowed = Math.min(this.distance, Math.max(MIN_OBSTRUCTED, hit - OBSTRUCTION_GAP));
      }
    }

    // Snap inwards, ease outwards. Coming in has to be immediate or the wall
    // is already through the near plane by the time the camera moves; going
    // back out immediately turns a doorway into a lurch.
    this.allowedDistance =
      allowed < this.allowedDistance
        ? allowed
        : Math.min(allowed, this.allowedDistance + RECOVER_PER_UPDATE);

    this.camera.position.set(
      this.target.x + dirX * this.allowedDistance,
      this.target.y + dirY * this.allowedDistance,
      this.target.z + dirZ * this.allowedDistance,
    );
    if (this.firstPerson) {
      const look = this.pitch - FIRST_PERSON_PITCH_ORIGIN;
      this.camera.lookAt(
        this.target.x - Math.sin(this.yaw) * Math.cos(look),
        this.target.y + Math.sin(look),
        this.target.z - Math.cos(this.yaw) * Math.cos(look),
      );
    } else {
      this.camera.lookAt(this.target);
    }
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
