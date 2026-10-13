/**
 * Blade ribbons: the sampled strip, how it fades, and who frees the GPU
 * objects.
 *
 * These run headless — a `BufferGeometry` and a `MeshBasicMaterial` need no
 * WebGL context, and `dispose()` on either is observable without one.
 */

import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

import {
  STRIPE_BRIGHTNESS,
  STRIPE_LIFETIME,
  TRAIL_SAMPLES,
  WeaponStripes,
  ribbonShade,
} from '../src/renderer/WeaponStripes';
import type { BladePair } from '../src/renderer/WeaponStripes';

function pair(ax: number, bx: number): BladePair {
  return [new THREE.Vector3(ax, 0, 0), new THREE.Vector3(bx, 1, 0)];
}

function harness(blade: () => BladePair | null) {
  const parent = new THREE.Object3D();
  const texture = vi.fn(async () => null);
  const stripes = new WeaponStripes({ parent, bladeOf: blade, texture });
  return { parent, texture, stripes };
}

function geometryOf(parent: THREE.Object3D): THREE.BufferGeometry {
  return (parent.children[0] as THREE.Mesh).geometry;
}

/** The x of each sample's first edge vertex, oldest first, as far as is drawn. */
function edgeXs(parent: THREE.Object3D): number[] {
  const g = geometryOf(parent);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const samples = g.drawRange.count / 6 + 1;
  return Array.from({ length: samples }, (_, s) => p.getX(s * 2));
}

describe('stringing blade samples into a ribbon', () => {
  it('draws nothing until the blade has been sampled twice', () => {
    const { parent, stripes } = harness(() => pair(5, 6));
    stripes.spawn(1, 1);
    stripes.advance(1 / 60);

    expect(geometryOf(parent).drawRange.count).toBe(0);
  });

  it('runs from the oldest sample to the newest', () => {
    const at = { x: 0 };
    const { parent, stripes } = harness(() => pair(at.x, at.x + 1));
    stripes.spawn(1, 1);
    for (const x of [0, 2, 5]) {
      at.x = x;
      stripes.advance(1 / 60);
    }

    expect(edgeXs(parent)).toEqual([0, 2, 5]);
  });

  it('keeps only the most recent samples', () => {
    const at = { x: 0 };
    const { parent, stripes } = harness(() => pair(at.x, at.x + 1));
    stripes.spawn(1, 1);
    for (let x = 0; x < TRAIL_SAMPLES + 3; x++) {
      at.x = x;
      stripes.advance(0.001);
    }

    const xs = edgeXs(parent);
    expect(xs).toHaveLength(TRAIL_SAMPLES);
    expect(xs[xs.length - 1]).toBe(TRAIL_SAMPLES + 2);
  });

  it('copies each sample, so a caller reusing its vectors cannot bend the tail', () => {
    const shared = pair(0, 1);
    const { parent, stripes } = harness(() => shared);
    stripes.spawn(1, 1);
    stripes.advance(1 / 60);
    shared[0].x = 9;
    stripes.advance(1 / 60);

    expect(edgeXs(parent)).toEqual([0, 9]);
  });
});

describe('how bright a ribbon draws', () => {
  it('is brightest at the newest edge and nothing at the tail', () => {
    const shade = ribbonShade(4, 0);
    expect(shade[0]).toBe(0);
    expect(shade[3]).toBeCloseTo(STRIPE_BRIGHTNESS, 6);
    for (let i = 1; i < shade.length; i++) expect(shade[i]!).toBeGreaterThan(shade[i - 1]!);
  });

  it('holds while young and fades to nothing by the end of its life', () => {
    expect(ribbonShade(3, 0.01)[2]).toBeCloseTo(STRIPE_BRIGHTNESS, 6);
    expect(ribbonShade(3, STRIPE_LIFETIME * 0.9)[2]!).toBeLessThan(STRIPE_BRIGHTNESS / 2);
    expect(ribbonShade(3, STRIPE_LIFETIME)[2]).toBe(0);
  });
});

describe('freeing what it allocated', () => {
  it('disposes a stripe that has aged out', () => {
    const { parent, stripes } = harness(() => pair(0, 1));
    stripes.spawn(1, 1);
    const mesh = parent.children[0] as THREE.Mesh;
    const geometry = vi.spyOn(mesh.geometry, 'dispose');
    const material = vi.spyOn(mesh.material as THREE.Material, 'dispose');

    stripes.advance(STRIPE_LIFETIME);

    expect(geometry).toHaveBeenCalledOnce();
    expect(material).toHaveBeenCalledOnce();
    expect(parent.children).toHaveLength(0);
    expect(stripes.count).toBe(0);
  });

  it('disposes a stripe whose body has gone mid-swing', () => {
    const alive = { yes: true };
    const { parent, stripes } = harness(() => (alive.yes ? pair(0, 1) : null));
    stripes.spawn(1, 1);
    const mesh = parent.children[0] as THREE.Mesh;
    const geometry = vi.spyOn(mesh.geometry, 'dispose');

    alive.yes = false;
    stripes.advance(1 / 60);

    expect(geometry).toHaveBeenCalledOnce();
    expect(parent.children).toHaveLength(0);
  });

  it('disposes everything still in flight when torn down', () => {
    const { parent, stripes } = harness(() => pair(0, 1));
    stripes.spawn(1, 1);
    stripes.spawn(2, 1);
    const disposals = parent.children.map(c => vi.spyOn((c as THREE.Mesh).geometry, 'dispose'));

    stripes.dispose();

    for (const d of disposals) expect(d).toHaveBeenCalledOnce();
    expect(parent.children).toHaveLength(0);
    expect(stripes.count).toBe(0);
  });
});

describe('when no ribbon is wanted at all', () => {
  it('makes nothing for a swing that carries no stripe', () => {
    const { parent, stripes, texture } = harness(() => pair(0, 1));

    stripes.spawn(1, 0);

    expect(parent.children).toHaveLength(0);
    expect(texture).not.toHaveBeenCalled();
  });

  it('makes nothing for a body whose blade cannot be sampled', () => {
    const { parent, stripes } = harness(() => null);

    stripes.spawn(1, 1);

    expect(parent.children).toHaveLength(0);
  });

  it('asks for the blade texture the swing names, capped at what ships', () => {
    const { stripes, texture } = harness(() => pair(0, 1));

    stripes.spawn(1, 3);
    stripes.spawn(2, 99);

    expect(texture).toHaveBeenNthCalledWith(1, 'texture/blade3.tga');
    expect(texture).toHaveBeenNthCalledWith(2, 'texture/blade10.tga');
  });

  it('counts the ribbons still in flight, which is what inspect reports', () => {
    const { stripes } = harness(() => pair(0, 1));

    expect(stripes.count).toBe(0);
    stripes.spawn(1, 1);
    stripes.spawn(2, 1);
    expect(stripes.count).toBe(2);
    stripes.advance(STRIPE_LIFETIME);
    expect(stripes.count).toBe(0);
  });
});
