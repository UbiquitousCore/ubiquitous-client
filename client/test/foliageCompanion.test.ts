/**
 * Batched foliage always renders as a cut-out, so a whole field is one
 * `InstancedMesh` draw call; `wantsFoliageCompanion` decides when one
 * placement also gets an individual soft-edged clone layered over its
 * (hidden) row, because that is where a hard cut-out edge is actually
 * visible.
 */

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';

import {
  FOLIAGE_BLEND_DISTANCE,
  FOLIAGE_BLEND_HYSTERESIS,
  foliageGraceExpired,
  wantsFoliageCompanion,
} from '../src/renderer/Renderer';
import { isFoliageVisible } from '../src/renderer/drawBudget';

const inside = (FOLIAGE_BLEND_DISTANCE - 1) ** 2;
const atNear = FOLIAGE_BLEND_DISTANCE ** 2;
const between = (FOLIAGE_BLEND_DISTANCE + FOLIAGE_BLEND_HYSTERESIS / 2) ** 2;
const pastFar = (FOLIAGE_BLEND_DISTANCE + FOLIAGE_BLEND_HYSTERESIS + 1) ** 2;

describe('wantsFoliageCompanion', () => {
  it('never wants one when the profile asks for cut-outs outright', () => {
    expect(wantsFoliageCompanion(false, false, 0)).toBe(false);
    expect(wantsFoliageCompanion(true, false, 0)).toBe(false);
  });

  it('spawns one once inside the near edge', () => {
    expect(wantsFoliageCompanion(false, true, inside)).toBe(true);
    expect(wantsFoliageCompanion(false, true, atNear)).toBe(false);
  });

  it('keeps an existing one until past the far edge, not the near one', () => {
    // Between the near and far edges: already-near stays, not-yet-near waits.
    expect(wantsFoliageCompanion(true, true, between)).toBe(true);
    expect(wantsFoliageCompanion(false, true, between)).toBe(false);
    // Past the far edge, even an existing companion goes.
    expect(wantsFoliageCompanion(true, true, pastFar)).toBe(false);
  });
});

describe('isFoliageVisible', () => {
  // A camera at the origin looking down -Z, the three.js default forward.
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
  camera.updateMatrixWorld();
  const frustum = new THREE.Frustum().setFromProjectionMatrix(
    new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
  );

  it('never culls what is close enough that facing does not matter', () => {
    // Behind the camera, but well inside the always-visible radius.
    expect(isFoliageVisible(frustum, 0, 0, 5, 25)).toBe(true);
  });

  it('keeps a placement the camera is actually pointed at', () => {
    expect(isFoliageVisible(frustum, 0, 0, -40, 1600)).toBe(true);
  });

  it('culls a distant placement the camera is not pointed at', () => {
    // Behind the camera, well past the always-visible radius.
    expect(isFoliageVisible(frustum, 0, 0, 40, 1600)).toBe(false);
    // To the side, out of the field of view, at the same distance.
    expect(isFoliageVisible(frustum, 40, 0, 0, 1600)).toBe(false);
  });
});

describe('foliageGraceExpired', () => {
  it('never expires a grace period that has not started', () => {
    // A glance away and back inside the grace window cancels it before it
    // is ever checked again — but if something does check first, undefined
    // must read as "not yet", not as "already due".
    expect(foliageGraceExpired(undefined, 999_999)).toBe(false);
  });

  it('holds until the deadline, then expires', () => {
    expect(foliageGraceExpired(1000, 999)).toBe(false);
    expect(foliageGraceExpired(1000, 1000)).toBe(true);
    expect(foliageGraceExpired(1000, 1001)).toBe(true);
  });
});
