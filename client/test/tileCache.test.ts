/**
 * Freeing a terrain tile: what it owns goes, what it borrows stays.
 *
 * The stance `instancedBatchDispose.test.ts` takes. A tile disposing a
 * material it only borrowed is a black hole in every other tile still drawing
 * with it, and tile eviction happens every 64 units the player walks — so
 * getting this wrong is a bug that arrives on its own.
 */

import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

import { disposeTile } from '../src/renderer/tileCache';
import type { BuiltTile } from '../src/renderer/tileCache';

function materialCache() {
  return { releaseRawTexture: vi.fn() } as unknown as Parameters<typeof disposeTile>[1];
}

function tile(over: Partial<BuiltTile> = {}): BuiltTile {
  return { objects: [], geometries: [], materials: [], water: [], textures: [], ...over };
}

describe('what a tile owns', () => {
  it('takes its objects out of the scene', () => {
    const parent = new THREE.Object3D();
    const mesh = new THREE.Object3D();
    parent.add(mesh);

    disposeTile(tile({ objects: [mesh] }), materialCache());

    expect(parent.children).toHaveLength(0);
  });

  it('frees its own geometry', () => {
    const geometry = new THREE.BufferGeometry();
    const freed = vi.spyOn(geometry, 'dispose');

    disposeTile(tile({ geometries: [geometry] }), materialCache());

    expect(freed).toHaveBeenCalledOnce();
  });

  it('frees the materials it made, and the water sheets over it', () => {
    const ground = new THREE.MeshBasicMaterial();
    const water = new THREE.ShaderMaterial();
    const groundFreed = vi.spyOn(ground, 'dispose');
    const waterFreed = vi.spyOn(water, 'dispose');

    disposeTile(tile({ materials: [ground], water: [water] }), materialCache());

    expect(groundFreed).toHaveBeenCalledOnce();
    expect(waterFreed).toHaveBeenCalledOnce();
  });
});

describe('what a tile borrows', () => {
  it('hands a raw texture back to the cache rather than disposing it', () => {
    const cache = materialCache();
    const request = { ref: 'texture/tiles/grass.tga', wrap: 'repeat', kind: 'ground' };

    disposeTile(tile({ textures: [request] as BuiltTile['textures'] }), cache);

    // Released, not disposed: another resident tile may still be drawing with it.
    expect(cache.releaseRawTexture).toHaveBeenCalledWith(
      'texture/tiles/grass.tga',
      'repeat',
      'ground',
    );
  });

  it('releases every texture it holds, not just the first', () => {
    const cache = materialCache();
    const requests = [
      { ref: 'a.tga', wrap: 'repeat', kind: 'ground' },
      { ref: 'b.tga', wrap: 'clamp', kind: 'mask' },
    ];

    disposeTile(tile({ textures: requests as BuiltTile['textures'] }), cache);

    expect(cache.releaseRawTexture).toHaveBeenCalledTimes(2);
  });
});

describe('an empty tile', () => {
  it('frees nothing and complains about nothing', () => {
    const cache = materialCache();

    expect(() => disposeTile(tile(), cache)).not.toThrow();
    expect(cache.releaseRawTexture).not.toHaveBeenCalled();
  });
});
