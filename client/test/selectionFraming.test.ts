/**
 * The camera before the world loads: the wide view over the place, the
 * close view of the character, and the move between them.
 */

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';

import {
  CLOSE_DISTANCE,
  DAIS_FACING,
  VIEW_BLEND_SECONDS,
  WIDE_START_HEADING,
  WIDE_START_OFFSET,
  WIDE_TURN_RATE,
  blendPoses,
  closePose,
  groundHaze,
  stepViewProgress,
  turnWide,
  widePose,
} from '../src/renderer/selectionFraming';

const STAND = new THREE.Vector3(120, 8, -40);

describe('the close view', () => {
  it('stands in front of the way the body faces and looks back at it', () => {
    const { eye, target } = closePose(STAND);
    const ahead = new THREE.Vector3(Math.sin(DAIS_FACING), 0, Math.cos(DAIS_FACING));
    const out = eye.clone().sub(STAND).setY(0);

    expect(out.length()).toBeCloseTo(CLOSE_DISTANCE, 6);
    expect(out.normalize().dot(ahead)).toBeCloseTo(1, 6);
    expect(target.x).toBe(STAND.x);
    expect(target.z).toBe(STAND.z);
  });

  it('looks down at the body from a little above it', () => {
    const { eye, target } = closePose(STAND);
    expect(eye.y).toBeGreaterThan(target.y);
    expect(target.y).toBeGreaterThan(STAND.y);
  });
});

describe('the wide view', () => {
  it('stands over the dais and looks out and a little down', () => {
    const { eye, target } = widePose(STAND, 0);
    expect(eye.x).toBe(STAND.x);
    expect(eye.z).toBe(STAND.z);
    expect(eye.y).toBeGreaterThan(STAND.y);
    expect(target.y).toBeLessThan(eye.y);
    expect(target.clone().sub(eye).setY(0).length()).toBeGreaterThan(0);
  });

  it('turns its look without moving the eye', () => {
    const a = widePose(STAND, 0);
    const b = widePose(STAND, 1);
    expect(b.eye).toEqual(a.eye);
    expect(b.target.distanceTo(a.target)).toBeGreaterThan(0);
  });

  /** Seen by the owner in play: the windmill beyond the dais starts on the left of the screen. */
  it('first looks a little right of the way the close view will, out past the dais', () => {
    const { eye, target } = widePose(STAND, WIDE_START_HEADING);
    const look = target.clone().sub(eye).setY(0).normalize();
    const close = closePose(STAND);
    const closeLook = close.target.clone().sub(close.eye).setY(0).normalize();
    expect(Math.acos(look.dot(closeLook))).toBeCloseTo(WIDE_START_OFFSET, 6);
    const camera = new THREE.PerspectiveCamera();
    camera.position.copy(eye);
    camera.lookAt(target);
    camera.updateMatrixWorld();
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    // The close view's line lies to the left of the first look.
    expect(closeLook.dot(right)).toBeLessThan(0);
  });

  /** Seen by the owner in play: the view sweeps to the right. */
  it('pans to the right as time passes', () => {
    const heading = WIDE_START_HEADING;
    const before = widePose(STAND, heading);
    const after = widePose(STAND, turnWide(heading, 1));
    // The screen's right, as a camera placed the way SelectionScene places it sees it.
    const camera = new THREE.PerspectiveCamera();
    camera.position.copy(before.eye);
    camera.lookAt(before.target);
    camera.updateMatrixWorld();
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    expect(after.target.clone().sub(before.target).dot(right)).toBeGreaterThan(0);
  });

  it('turns at its own steady rate, and not at all in no time', () => {
    expect(turnWide(0.4, 0)).toBe(0.4);
    expect(Math.abs(turnWide(0.4, 2) - 0.4)).toBeCloseTo(2 * WIDE_TURN_RATE, 9);
  });
});

describe('moving between the views', () => {
  it('takes the whole blend time to get from one to the other', () => {
    let p = 0;
    p = stepViewProgress(p, true, VIEW_BLEND_SECONDS / 2);
    expect(p).toBeCloseTo(0.5, 6);
    p = stepViewProgress(p, true, VIEW_BLEND_SECONDS);
    expect(p).toBe(1);
    expect(stepViewProgress(p, false, VIEW_BLEND_SECONDS * 2)).toBe(0);
  });

  it('moves nothing in a frame of no time', () => {
    expect(stepViewProgress(0, true, 0)).toBe(0);
  });

  it('turns back from wherever it had got to', () => {
    const midway = stepViewProgress(0, true, VIEW_BLEND_SECONDS / 4);
    const back = stepViewProgress(midway, false, 1 / 60);
    expect(back).toBeLessThan(midway);
    expect(back).toBeGreaterThan(0);
  });

  it('lands exactly on each view and eases out of it', () => {
    const wide = widePose(STAND, 0.3);
    const close = closePose(STAND);
    expect(blendPoses(wide, close, 0).eye).toEqual(wide.eye);
    expect(blendPoses(wide, close, 1).target).toEqual(close.target);

    const total = wide.eye.distanceTo(close.eye);
    const early = blendPoses(wide, close, 0.1).eye.distanceTo(wide.eye);
    expect(early).toBeLessThan(total * 0.1);
  });
});

describe('the haze over the ground before the world loads', () => {
  const TILE = 64;

  it('closes fully before the nearest edge of the ground loaded round the dais', () => {
    // The dais can stand anywhere in its own tile, so the nearest edge of
    // a square loaded `out` tiles each way is at least `out` tiles away.
    for (const out of [2, 4, 6]) expect(groundHaze(out, TILE).to).toBeLessThanOrEqual(out * TILE);
  });

  it('leaves the dais and what the wide view looks at clear', () => {
    const haze = groundHaze(4, TILE);
    expect(haze.from).toBeGreaterThan(CLOSE_DISTANCE * 10);
    expect(haze.from).toBeLessThan(haze.to);
  });
});
