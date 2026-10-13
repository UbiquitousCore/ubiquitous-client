/**
 * A chunk can name a ground texture the build does not carry. The ground
 * material must not wait for it: a material that waits draws its stand-in,
 * which shows the base texture alone, and the chunk reads as a square of the
 * wrong ground among its neighbours. Program text is a stand-in written for
 * the test.
 */

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { TerrainTileData } from '../src/assets/types';
import type { MaterialCache } from '../src/renderer/MaterialCache';
import { buildTerrainTile } from '../src/renderer/TerrainFactory';
import { createTerrainMaterial, type TerrainMaterial } from '../src/renderer/terrainShader';

const STAND_IN = {
  vertex: 'attribute vec4 Vertex;\nvoid main() { gl_Position = Vertex; }',
  fragment:
    'uniform sampler2D texture1;\nvoid main() { gl_FragColor = texture2D(texture1, vec2(0.5)); }',
};

/** A cache that has every texture except those named in `absent`. Only
 * textures now: the game never loads a build program, so neither does this. */
function cache(absent: readonly string[]): MaterialCache {
  return {
    rawTexture: async (ref: string) =>
      absent.includes(ref) ? null : new THREE.Texture({ width: 256, height: 256 } as never),
  } as unknown as MaterialCache;
}

function tile(refs: (string | null)[]): TerrainTileData {
  return {
    tile: [0, 0],
    origin: [0, 0],
    side: 3,
    tileSize: 64,
    heights: new Float32Array(9),
    colours: null,
    visible: [],
    water: [],
    chunkTextures: new Array(64).fill(refs),
    baseTexture: null,
    maskTexture: 'mask:m:0,0',
  };
}

/** Let every texture and program request settle. */
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

async function materialFor(refs: (string | null)[], absent: string[]): Promise<TerrainMaterial> {
  const built = buildTerrainTile(tile(refs), cache(absent))!;
  // The bench alone would hand over a build program; here our own stand-in.
  (built.materials[0] as TerrainMaterial).useProgram(STAND_IN);
  await settle();
  expect(built.materials).toHaveLength(1);
  return built.materials[0] as TerrainMaterial;
}

describe('ground layers the build does not carry', () => {
  it('draws the chunk with its other layers when an upper layer is missing', async () => {
    const material = await materialFor(['base.tga', 'one.tga', 'gone.tga'], ['gone.tga']);
    expect(material.path).toBe('loaded');
    expect(material.uniforms.uHas2.value).toBe(0);
    expect(material.uniforms.uHas1.value).toBe(1);
  });

  it('does the same for a missing middle layer', async () => {
    const material = await materialFor(['base.tga', 'gone.tga', 'two.tga'], ['gone.tga']);
    expect(material.path).toBe('loaded');
    expect(material.uniforms.uHas1.value).toBe(0);
  });

  it('draws without a mask when the tile has none: every layer above the base is then unused', async () => {
    const material = await materialFor(['base.tga', 'one.tga', null], ['mask:m:0,0']);
    expect(material.path).toBe('loaded');
    expect(material.uniforms.uHasMask.value).toBe(0);
  });

  it('keeps the stand-in when the base itself is missing', async () => {
    // The loaded program would blend over a black base; the stand-in draws
    // a neutral ground colour instead.
    const material = await materialFor(['gone.tga', 'one.tga', null], ['gone.tga']);
    expect(material.path).toBe('fallback');
  });
});

/** The build's blend, written for the test in the same shape. */
const BLENDING = {
  vertex: STAND_IN.vertex,
  fragment: [
    'uniform sampler2D texture1;',
    'uniform sampler2D texture2;',
    'uniform sampler2D texture3;',
    'uniform sampler2D texture4;',
    'varying vec2 vCoord0;',
    'varying vec2 vCoord1;',
    'void main() {',
    '  vec4 mask = texture2D(texture4, vCoord1);',
    '  float shade = texture2D( texture4 , vCoord0).b;',
    '  vec3 c = mix(texture2D(texture1, vCoord0).rgb, texture2D(texture2, vCoord0).rgb, mask.r);',
    '  c = mix(c, texture2D(texture3, vCoord0).rgb, mask.g);',
    '  gl_FragColor = vec4(c * (1.0 - shade), 1.0);',
    '}',
  ].join('\n'),
};

describe('an upper layer with nothing to draw', () => {
  it('reads every mask sample through the layer weights', async () => {
    const material = createTerrainMaterial();
    material.expect([0, 2], false);
    material.bindLayer(0, new THREE.Texture());
    material.bindLayer(2, new THREE.Texture());
    material.useProgram(BLENDING);
    expect(material.path).toBe('loaded');
    const text = material.fragmentShader;
    expect(text).not.toMatch(/texture2D\s*\(\s*texture4\b/);
    expect(text.match(/groundMask\s*\(\s*texture4\b/g)).toHaveLength(2);
    // Red weighs layer 1 and green layer 2, each by whether it is bound;
    // blue, the shadow, is left alone.
    expect(text).toContain('m.r *= uHas1;');
    expect(text).toContain('m.g *= uHas2;');
    expect(text).not.toMatch(/m\.b\s*\*=/);
  });

  it('weighs an empty layer and a missing one at zero, and a bound one at one', async () => {
    const empty = await materialFor(['base.tga', null, 'two.tga'], []);
    expect([empty.uniforms.uHas1.value, empty.uniforms.uHas2.value]).toEqual([0, 1]);
    const missing = await materialFor(['base.tga', 'one.tga', 'gone.tga'], ['gone.tga']);
    expect([missing.uniforms.uHas1.value, missing.uniforms.uHas2.value]).toEqual([1, 0]);
  });
});
