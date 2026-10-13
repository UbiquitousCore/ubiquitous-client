/**
 * Fading a spell effect out with distance, and where that distance is from.
 *
 * The position half has a hazard that costs everything when it goes wrong:
 * measure the wrong one and every effect reads as being at the origin, so the
 * whole lot gets culled.
 */

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';

import { EFFECT_FADE_FRACTION, effectFade, effectWorldPosition } from '../src/renderer/effectFade';

const DISTANCE = 100;
const FADE_START = DISTANCE * EFFECT_FADE_FRACTION;

/** Squared distance, which is what the caller has to hand. */
const sq = (d: number): number => d * d;

describe('how visible an effect is', () => {
  it('is fully drawn anywhere inside the fade band', () => {
    expect(effectFade(sq(0), DISTANCE)).toBe(1);
    expect(effectFade(sq(FADE_START - 1), DISTANCE)).toBe(1);
    expect(effectFade(sq(FADE_START), DISTANCE)).toBe(1);
  });

  it('eases to nothing across the band rather than blinking out', () => {
    const middle = effectFade(sq((FADE_START + DISTANCE) / 2), DISTANCE);

    expect(middle).toBeGreaterThan(0);
    expect(middle).toBeLessThan(1);
    expect(middle).toBeCloseTo(0.5, 6);
  });

  it('is gone at the effect distance, and stays gone past it', () => {
    expect(effectFade(sq(DISTANCE), DISTANCE)).toBeCloseTo(0, 6);
    expect(effectFade(sq(DISTANCE + 1), DISTANCE)).toBe(0);
    expect(effectFade(sq(DISTANCE * 10), DISTANCE)).toBe(0);
  });

  it('never goes negative, however far out', () => {
    for (const d of [DISTANCE, DISTANCE + 0.001, DISTANCE * 2]) {
      expect(effectFade(sq(d), DISTANCE)).toBeGreaterThanOrEqual(0);
    }
  });

  it('falls off monotonically across the band', () => {
    let previous = 1;
    for (let d = FADE_START; d <= DISTANCE; d += 1) {
      const fade = effectFade(sq(d), DISTANCE);
      expect(fade).toBeLessThanOrEqual(previous);
      previous = fade;
    }
  });

  it('draws nothing at all when the tier allows no effects', () => {
    // A zero distance must not divide by a zero band.
    expect(effectFade(sq(0), 0)).toBe(0);
    expect(Number.isFinite(effectFade(sq(1), 0))).toBe(true);
  });
});

describe('where an effect is measured from', () => {
  it('is its own position when it stands free', () => {
    const effect = new THREE.Object3D();
    effect.position.set(3, 4, 5);

    expect(effectWorldPosition(effect, false, null)).toEqual([3, 4, 5]);
  });

  it('is the bone’s world position when it is attached to one', () => {
    // Its own position is the origin in bone coordinates; reading that culls it.
    const bone = new THREE.Object3D();
    bone.position.set(10, 20, 30);
    bone.updateMatrixWorld(true);
    const effect = new THREE.Object3D();
    bone.add(effect);

    expect(effectWorldPosition(effect, true, bone)).toEqual([10, 20, 30]);
  });

  it('carries the whole chain, not just the immediate parent', () => {
    const body = new THREE.Object3D();
    body.position.set(100, 0, 0);
    const bone = new THREE.Object3D();
    bone.position.set(0, 2, 0);
    body.add(bone);
    body.updateMatrixWorld(true);
    const effect = new THREE.Object3D();
    bone.add(effect);

    expect(effectWorldPosition(effect, true, bone)).toEqual([100, 2, 0]);
  });

  it('falls back to its own position when it claims a host it has not got', () => {
    const effect = new THREE.Object3D();
    effect.position.set(1, 2, 3);

    expect(effectWorldPosition(effect, true, null)).toEqual([1, 2, 3]);
  });
});
