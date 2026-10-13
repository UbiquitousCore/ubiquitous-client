/**
 * Blob shadows: which bodies cast, where the disc sits, how big it is, and
 * the instanced buffers that draw them. The ground fit itself is covered in
 * groundFit.test.ts; here it only has to be applied.
 */

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  ObjectShadows,
  SHADOW_CAP,
  SHADOW_RANGE,
  SHADOW_SPREAD,
  collectShadows,
} from '../src/renderer/ObjectShadows';
import type { ShadowBody, ShadowWorld } from '../src/renderer/ObjectShadows';
import { DECAL_LIFT } from '../src/renderer/groundFit';
import type { GroundPoint } from '../src/world/World';

type Kind = 'creature' | 'player' | 'scenery' | 'static';

function world(
  groundAt: (x: number, z: number) => GroundPoint = () => ({ y: 0, normal: [0, 1, 0] }),
  swimming = false,
): ShadowWorld & {
  entities: Map<number, ShadowBody>;
  add(id: number, kind: Kind, at: [number, number, number], scale?: number): void;
} {
  const entities = new Map<number, ShadowBody>();
  return {
    entities,
    get movers() {
      return entities.values();
    },
    groundPoint: (x, z) => groundAt(x, z),
    waterStateAt: () => ({ state: swimming ? 'swimming' : 'dry' }),
    add(id, kind, position, scale = 1) {
      entities.set(id, { id, version: 0, kind, position, scale: [scale, scale, scale] });
    },
  };
}

const HALF: [number, number] = [0.4, 0.2];
const extents = (): [number, number] => HALF;

describe('who casts a shadow', () => {
  it('creatures and players do; scenery and objects never do', () => {
    const w = world();
    w.add(1, 'creature', [0, 0, 0]);
    w.add(2, 'player', [1, 0, 0]);
    w.add(3, 'scenery', [2, 0, 0]);
    w.add(4, 'static', [3, 0, 0]);
    expect(
      collectShadows(w, { x: 0, z: 0 }, extents)
        .map(b => b.x)
        .sort(),
    ).toEqual([0, 1]);
  });

  it('only bodies within range of the hero, measured along the ground', () => {
    const w = world();
    w.add(1, 'creature', [SHADOW_RANGE - 1, 50, 0]); // far above, still near on the map
    w.add(2, 'creature', [SHADOW_RANGE + 1, 0, 0]);
    expect(collectShadows(w, { x: 0, z: 0 }, extents).map(b => b.x)).toEqual([SHADOW_RANGE - 1]);
  });

  it('nothing for a body with no model yet', () => {
    const w = world();
    w.add(1, 'creature', [0, 0, 0]);
    expect(collectShadows(w, { x: 0, z: 0 }, () => undefined)).toEqual([]);
  });

  it('nothing for a body swimming', () => {
    const w = world(undefined, true);
    w.add(1, 'creature', [0, 0, 0]);
    expect(collectShadows(w, { x: 0, z: 0 }, extents)).toEqual([]);
  });

  it('keeps the nearest when there are more than it will draw', () => {
    const w = world();
    for (let i = 0; i < 10; i++) w.add(i, 'creature', [15, 0, 0]);
    for (let i = 10; i < SHADOW_CAP + 10; i++) w.add(i, 'creature', [1, 0, 0]);
    const blobs = collectShadows(w, { x: 0, z: 0 }, extents);
    expect(blobs).toHaveLength(SHADOW_CAP);
    expect(blobs.every(b => b.x === 1)).toBe(true);
  });
});

describe('where the disc sits and how big it is', () => {
  it('lies on the ground under the body, just above it', () => {
    const w = world(() => ({ y: -4, normal: [0, 1, 0] }));
    w.add(1, 'creature', [6, -3.5, 7]);
    const [blob] = collectShadows(w, { x: 6, z: 7 }, extents);
    expect(blob).toMatchObject({ x: 6, z: 7 });
    expect(blob!.y).toBeCloseTo(-4 + DECAL_LIFT, 6);
  });

  it('is a little wider than the body, and grows with it', () => {
    const w = world();
    w.add(1, 'creature', [0, 0, 0]);
    w.add(2, 'creature', [1, 0, 0], 3);
    const [small, big] = collectShadows(w, { x: 0, z: 0 }, extents);
    const mean = (HALF[0] + HALF[1]) / 2;
    expect(small!.radius).toBeCloseTo(mean * SHADOW_SPREAD, 6);
    expect(small!.radius).toBeGreaterThan(mean);
    expect(big!.radius).toBeCloseTo(small!.radius * 3, 6);
  });

  it('follows the ground it sits on', () => {
    const w = world(x => ({ y: x > 0.1 ? 0.15 : 0, normal: [0, 1, 0] }));
    w.add(1, 'creature', [0, 0, 0]);
    const [blob] = collectShadows(w, { x: 0, z: 0 }, extents);
    // +x corners are entries 1 and 3.
    expect(blob!.corners[1]).toBeCloseTo(0.15, 6);
    expect(blob!.corners[0]).toBe(0);
  });

  it('re-fits a body only when it has moved', () => {
    let asked = 0;
    const w = world(() => {
      asked++;
      return { y: 0, normal: [0, 1, 0] };
    });
    w.add(1, 'creature', [0, 0, 0]);
    const cache = new Map();
    collectShadows(w, { x: 0, z: 0 }, extents, cache);
    const once = asked;
    collectShadows(w, { x: 0, z: 0 }, extents, cache);
    expect(asked).toBe(once);
    w.entities.get(1)!.version++;
    collectShadows(w, { x: 0, z: 0 }, extents, cache);
    expect(asked).toBe(once * 2);
  });
});

describe('ObjectShadows', () => {
  const geometryOf = (s: ObjectShadows) =>
    (s.object.children[0] as THREE.Mesh).geometry as THREE.InstancedBufferGeometry;

  it('draws exactly the discs it is given, and none after clear', () => {
    const shadows = new ObjectShadows();
    expect(geometryOf(shadows).instanceCount).toBe(0);
    shadows.set([{ x: 1, y: 2, z: 3, radius: 0.9, corners: [0, 0.5, -0.5, 1] }]);
    const g = geometryOf(shadows);
    expect(g.instanceCount).toBe(1);
    expect(Array.from(g.getAttribute('blobCentre').array.slice(0, 3))).toEqual([1, 2, 3]);
    expect(g.getAttribute('blobRadius').array[0]).toBeCloseTo(0.9, 6);
    expect(Array.from(g.getAttribute('blobCorners').array.slice(0, 4))).toEqual([0, 0.5, -0.5, 1]);
    shadows.clear();
    expect(g.instanceCount).toBe(0);
    shadows.dispose();
  });

  it('never draws past its buffers', () => {
    const shadows = new ObjectShadows();
    const many = Array.from({ length: SHADOW_CAP * 4 }, (_, i) => ({
      x: i,
      y: 0,
      z: 0,
      radius: 1,
      corners: [0, 0, 0, 0] as [number, number, number, number],
    }));
    shadows.set(many);
    expect(geometryOf(shadows).instanceCount).toBe(SHADOW_CAP);
    shadows.dispose();
  });

  it('switches onto the texture once it arrives', () => {
    const shadows = new ObjectShadows();
    const material = (shadows.object.children[0] as THREE.Mesh).material as THREE.ShaderMaterial;
    expect(material.uniforms.uHasMap.value).toBe(0);
    shadows.setTexture(new THREE.Texture());
    expect(material.uniforms.uHasMap.value).toBe(1);
    shadows.dispose();
  });
});
