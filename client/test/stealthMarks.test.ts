/**
 * A stealthed body wears no name over its head and casts no shadow on the
 * ground, for every screen that still draws it faded: the hero's own and
 * their team's. Both come back the moment stealth ends.
 */

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import { collectShadows } from '../src/renderer/ObjectShadows';
import type { ShadowBody, ShadowWorld } from '../src/renderer/ObjectShadows';
import { showNamePlate } from '../src/renderer/nameLabels';

function worldOf(...bodies: ShadowBody[]): ShadowWorld {
  return {
    movers: bodies,
    groundPoint: () => ({ y: 0, normal: [0, 1, 0] }),
    waterStateAt: () => ({ state: 'dry' }),
  };
}

const extents = (): [number, number] => [0.4, 0.2];
const body = (id: number, x: number): ShadowBody => ({
  id,
  version: 0,
  kind: 'player',
  position: [x, 0, 0],
  scale: [1, 1, 1],
});

describe('the shadow of a stealthed body', () => {
  it('is not cast while the body is stealthed', () => {
    const sneaking = { ...body(1, 0), networkStealthed: true };
    const w = worldOf(sneaking, body(2, 1));
    expect(collectShadows(w, { x: 0, z: 0 }, extents).map(b => b.x)).toEqual([1]);
  });

  it('is cast again once stealth ends, even from the same cache', () => {
    const sneaking = { ...body(1, 0), networkStealthed: true };
    const w = worldOf(sneaking);
    const cache = new Map();
    expect(collectShadows(w, { x: 0, z: 0 }, extents, cache)).toEqual([]);
    sneaking.networkStealthed = false;
    expect(collectShadows(w, { x: 0, z: 0 }, extents, cache).map(b => b.x)).toEqual([0]);
  });
});

describe('the name over a stealthed body', () => {
  it('is hidden while the body is stealthed and shown when stealth ends', () => {
    const plate = new THREE.Sprite();
    showNamePlate(plate, { networkStealthed: true });
    expect(plate.visible).toBe(false);
    showNamePlate(plate, { networkStealthed: false });
    expect(plate.visible).toBe(true);
  });

  it('is shown on a body the server has said nothing about', () => {
    const plate = new THREE.Sprite();
    plate.visible = false;
    showNamePlate(plate, {});
    expect(plate.visible).toBe(true);
  });

  it('hides with a distance-hidden body, whose plate hangs off the shown object', () => {
    const plate = new THREE.Sprite();
    showNamePlate(plate, {}, false);
    expect(plate.visible).toBe(false);
    showNamePlate(plate, {}, true);
    expect(plate.visible).toBe(true);
  });
});
