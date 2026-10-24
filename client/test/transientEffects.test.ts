import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import { markTransientEffect, stripTransientEffects } from '../src/renderer/transientEffects';

function body(): { root: THREE.Group; hand: THREE.Group; helmet: THREE.Group } {
  const root = new THREE.Group();
  const hand = new THREE.Group();
  const helmet = new THREE.Group();
  root.add(hand);
  hand.add(helmet);
  return { root, hand, helmet };
}

describe('stripTransientEffects', () => {
  it('takes a marked effect off whatever node it hangs on, and leaves the gear', () => {
    const { root, hand, helmet } = body();
    const bleed = new THREE.Group();
    markTransientEffect(bleed);
    hand.add(bleed);
    const glow = new THREE.Group();
    markTransientEffect(glow);
    helmet.add(glow);

    const removed = stripTransientEffects(root);

    expect(removed).toBe(2);
    expect(bleed.parent).toBeNull();
    expect(glow.parent).toBeNull();
    expect(helmet.parent).toBe(hand);
  });

  it("leaves an unmarked effect alone: a weapon's own glow is gear", () => {
    const { root, hand } = body();
    const weaponGlow = new THREE.Group();
    hand.add(weaponGlow);

    expect(stripTransientEffects(root)).toBe(0);
    expect(weaponGlow.parent).toBe(hand);
  });

  it('survives the body being cloned, which is how a copy is made', () => {
    const { root, hand } = body();
    const bleed = new THREE.Group();
    markTransientEffect(bleed);
    hand.add(bleed);

    const copy = root.clone(true);

    expect(stripTransientEffects(copy)).toBe(1);
    expect(bleed.parent).toBe(hand);
  });
});
