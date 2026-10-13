/**
 * What the material cache does for foliage and for a tile's textures.
 *
 * A blended material cannot join a static batch, so small scenery asks for a
 * cut-out twin of each of its blended materials and, when the setting flips,
 * for the original back. Ground textures are held per tile and released with
 * it, mask included, so walking does not accumulate uploads.
 */

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';

import { MaterialCache } from '../src/renderer/MaterialCache';
import type { MaterialSpec } from '../src/renderer/MaterialCache';
import type { TextureData } from '../src/assets/types';
import { fadeClone } from '../src/renderer/fadeMaterial';
import { FOLIAGE_SOFTNESS } from '../src/renderer/foliageSoftness';

function resources() {
  const pending: Array<(data: TextureData | null) => void> = [];
  return {
    pending,
    texture: (_ref: string): Promise<TextureData | null> =>
      new Promise(resolve => pending.push(resolve)),
    settleAll(data: TextureData | null = null) {
      for (const r of pending.splice(0)) r(data);
    },
  };
}

const image = (): TextureData =>
  ({ image: { width: 1, height: 1 } as unknown as ImageBitmap }) as TextureData;

const BLENDED: MaterialSpec = {
  texture: 'texture/grass.tga',
  blend: 'blend',
  doubleSided: true,
  unlit: true,
};

describe('foliageVariant', () => {
  it('gives a blended material a cut-out twin that shares its texture', () => {
    const r = resources();
    const cache = new MaterialCache(r, new THREE.Vector3());
    const blended = cache.get(BLENDED) as THREE.MeshBasicMaterial;

    const cutout = cache.foliageVariant(blended, true) as THREE.MeshBasicMaterial;

    expect(cutout).not.toBe(blended);
    expect(cutout.transparent).toBe(false);
    expect(cutout.alphaTest).toBe(0.5);
    expect(cutout.depthWrite).toBe(true);
    // Asking again is the same twin, and asking for blended is a blended
    // twin of its own: foliage is soft, the surface it came from is not.
    expect(cache.foliageVariant(blended, true)).toBe(cutout);
    const soft = cache.foliageVariant(cutout, false) as THREE.MeshBasicMaterial;
    expect(soft).not.toBe(blended);
    expect(soft.transparent).toBe(true);
    expect(cache.foliageVariant(soft, false)).toBe(soft);
    expect(cache.foliageVariant(soft, true)).toBe(cutout);
    expect(cache.foliageVariant(cutout, true)).toBe(cutout);
  });

  it('samples foliage a little blurrier, and nothing else, whether cut out or blended', () => {
    const r = resources();
    const cache = new MaterialCache(r, new THREE.Vector3());
    const blended = cache.get(BLENDED);
    const lookup = (material: THREE.Material): string => {
      const shader = {
        uniforms: {},
        vertexShader: THREE.ShaderLib.basic.vertexShader,
        fragmentShader: THREE.ShaderLib.basic.fragmentShader,
      } as unknown as THREE.WebGLProgramParametersWithUniforms;
      material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
      return shader.fragmentShader;
    };
    const blurrier = `texture2D( map, vMapUv, ${FOLIAGE_SOFTNESS.toFixed(1)} )`;
    expect(lookup(cache.foliageVariant(blended, true))).toContain(blurrier);
    expect(lookup(cache.foliageVariant(blended, false))).toContain(blurrier);
    expect(lookup(blended)).toContain('#include <map_fragment>');
    expect(cache.foliageVariant(blended, true).customProgramCacheKey()).toMatch(/soft$/);
    // A copy made for a fade keeps it.
    expect(lookup(fadeClone(cache.foliageVariant(blended, true))!)).toContain(blurrier);
  });

  it('leaves anything that is not blended foliage alone', () => {
    const r = resources();
    const cache = new MaterialCache(r, new THREE.Vector3());
    const opaque = cache.get({ ...BLENDED, blend: 'opaque' });
    const trueCutout = cache.get({ ...BLENDED, blend: 'cutout' });
    const additive = cache.get({ ...BLENDED, blend: 'additive' });
    const foreign = new THREE.MeshBasicMaterial();

    expect(cache.foliageVariant(opaque, true)).toBe(opaque);
    expect(cache.foliageVariant(trueCutout, false)).toBe(trueCutout);
    expect(cache.foliageVariant(additive, true)).toBe(additive);
    expect(cache.foliageVariant(foreign, true)).toBe(foreign);
  });
});

describe('rawTexture release', () => {
  it('disposes a texture when its last holder lets go, and not before', async () => {
    const r = resources();
    const cache = new MaterialCache(r, new THREE.Vector3());
    const first = cache.rawTexture('mask:1:0,0', 'clamp', 'data');
    r.settleAll(image());
    const texture = (await first)!;
    await cache.rawTexture('mask:1:0,0', 'clamp', 'data');
    let disposed = 0;
    texture.addEventListener('dispose', () => {
      disposed++;
    });

    cache.releaseRawTexture('mask:1:0,0', 'clamp', 'data');
    expect(disposed).toBe(0);
    cache.releaseRawTexture('mask:1:0,0', 'clamp', 'data');
    expect(disposed).toBe(1);
    expect(cache.rawTextureCount).toBe(0);
    // A third release is a bug upstream and does nothing here.
    cache.releaseRawTexture('mask:1:0,0', 'clamp', 'data');
    expect(disposed).toBe(1);
  });

  it('does not upload a texture whose only holder left while it was loading', async () => {
    const r = resources();
    const cache = new MaterialCache(r, new THREE.Vector3());
    const late = cache.rawTexture('mask:1:5,5', 'clamp', 'data');
    cache.releaseRawTexture('mask:1:5,5', 'clamp', 'data');
    r.settleAll(image());

    expect(await late).toBeNull();
    expect(cache.rawTextureCount).toBe(0);
  });

  it('keys by wrap and kind as well as by name', async () => {
    const r = resources();
    const cache = new MaterialCache(r, new THREE.Vector3());
    const a = cache.rawTexture('texture/ground.tga');
    const b = cache.rawTexture('texture/ground.tga', 'clamp');
    r.settleAll(image());
    expect(await a).not.toBe(await b);
    expect(cache.rawTextureCount).toBe(2);
  });
});
