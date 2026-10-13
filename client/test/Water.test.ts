/**
 * Water: the level lookup, the swim threshold, and the surface geometry.
 *
 * The thresholds that matter are `SWIM_DEPTH` and the water-flag estimate.
 * Getting the comparison the wrong way round gives you a player walking along
 * a lake bed.
 */

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Terrain, SWIM_DEPTH } from '../src/world/Terrain';
import {
  attachWaterTextures,
  buildWaterTile,
  createWaterMaterial,
} from '../src/renderer/WaterFactory';
import {
  RIPPLE_DRIFT,
  RIPPLE_REPEATS_PER_TILE,
  SHORE_DEPTH,
  depthCoord,
  shoreAlpha,
} from '../src/renderer/waterShader';
import { BUOYANCY, GRAVITY, JUMP_START_VELOCITY } from '../src/gameplay/PlayerMovement';
import type { TerrainTileData } from '../src/assets/types';

/** A 64-unit tile of flat ground at `ground`, with per-chunk water levels. */
function tile(ground: number, water: (number | null)[]): TerrainTileData {
  const side = 9;
  return {
    tile: [0, 0],
    origin: [0, 0],
    side,
    tileSize: 64,
    heights: Float32Array.from(new Array(side * side).fill(ground)),
    colours: null,
    visible: [],
    water,
    chunkTextures: [],
    baseTexture: null,
    maskTexture: null,
  };
}

/** 8x8 chunks, all at the same level. */
function allChunks(level: number | null): (number | null)[] {
  return new Array(64).fill(level);
}

describe('Terrain water lookup', () => {
  it('reports no water where a tile carries none', () => {
    const t = new Terrain([tile(0, [])]);
    expect(t.waterAt(32, 32)).toBeNull();
    expect(t.waterStateAt(32, 32).state).toBe('dry');
  });

  it('reads the level of the chunk under the point, not the tile', () => {
    // Chunks are 8 units across; only chunk (0,0) has water.
    const w = allChunks(null);
    w[0] = 5;
    const t = new Terrain([tile(0, w)]);
    expect(t.waterAt(4, 4)).toBe(5);
    expect(t.waterAt(12, 4)).toBeNull(); // next chunk along x
    expect(t.waterAt(4, 12)).toBeNull(); // next chunk along z
  });

  it('is dry when the ground stands above the surface', () => {
    const t = new Terrain([tile(10, allChunks(5))]);
    expect(t.waterStateAt(32, 32).state).toBe('dry');
  });

  it('wades when the bed is less than the swim line below the surface', () => {
    const t = new Terrain([tile(0, allChunks(SWIM_DEPTH - 0.1))]);
    const at = t.waterStateAt(32, 32);
    expect(at.state).toBe('wading');
    expect(at.surface).toBeCloseTo(SWIM_DEPTH - 0.1, 5);
  });

  it('swims when the bed drops further than the swim line', () => {
    const t = new Terrain([tile(0, allChunks(SWIM_DEPTH + 0.1))]);
    const at = t.waterStateAt(32, 32);
    expect(at.state).toBe('swimming');
    // A swimmer floats on the swim line, not on the bed.
    expect(at.swimLine).toBeCloseTo(0.1, 5);
  });

  it('starts swimming once the water is chest deep on the player, 1.25 units', () => {
    expect(new Terrain([tile(0, allChunks(1.2))]).waterStateAt(32, 32).state).toBe('wading');
    expect(new Terrain([tile(0, allChunks(1.3))]).waterStateAt(32, 32).state).toBe('swimming');
  });

  it('floats the swimmer below the surface by exactly the swim depth', () => {
    const t = new Terrain([tile(-40, allChunks(6))]);
    const at = t.waterStateAt(32, 32);
    expect(at.state).toBe('swimming');
    expect(at.surface! - at.swimLine!).toBeCloseTo(SWIM_DEPTH, 5);
  });
});

describe('buildWaterTile', () => {
  it('builds nothing for a tile with no water', () => {
    expect(buildWaterTile(tile(0, []))).toBeNull();
    expect(buildWaterTile(tile(0, allChunks(null)))).toBeNull();
  });

  it('emits one quad per wet chunk, at that chunk position and level', () => {
    const w = allChunks(null);
    w[0] = 3;
    const built = buildWaterTile(tile(0, w))!;
    expect(built).not.toBeNull();

    const pos = built.geometry.getAttribute('position');
    expect(pos.count).toBe(4); // one quad
    // Every vertex sits at the chunk's level.
    for (let i = 0; i < pos.count; i++) expect(pos.getY(i)).toBeCloseTo(3, 5);
    // And spans chunk (0,0): 0..8 in x and z.
    const xs = [...Array(pos.count)].map((_, i) => pos.getX(i));
    const zs = [...Array(pos.count)].map((_, i) => pos.getZ(i));
    expect(Math.min(...xs)).toBeCloseTo(0, 5);
    expect(Math.max(...xs)).toBeCloseTo(8, 5);
    expect(Math.min(...zs)).toBeCloseTo(0, 5);
    expect(Math.max(...zs)).toBeCloseTo(8, 5);
  });

  it('keeps chunks at different levels apart', () => {
    const w = allChunks(null);
    w[0] = 1;
    w[1] = 7;
    const built = buildWaterTile(tile(0, w))!;
    const pos = built.geometry.getAttribute('position');
    expect(pos.count).toBe(8);
    const ys = new Set([...Array(pos.count)].map((_, i) => Math.round(pos.getY(i))));
    expect(ys).toEqual(new Set([1, 7]));
  });

  it('is transparent, double-sided and does not write depth', () => {
    const built = buildWaterTile(tile(0, allChunks(2)))!;
    expect(built.material.transparent).toBe(true);
    expect(built.material.depthWrite).toBe(false);
    // Visible from underneath too.
    expect(built.material.side).toBe(2 /* THREE.DoubleSide */);
  });
});

/** A stand-in for a build's water program: our own text, declaring only what the tests read. */
function standInWater(marker: string): { vertex: string; fragment: string } {
  return {
    vertex: [
      'attribute vec2 TexCoord0;',
      'attribute vec4 Vertex;',
      'varying vec2 spot;',
      'void main() {',
      '  spot = TexCoord0;',
      '  gl_Position = vec4(Vertex.xyz, 1.0);',
      '}',
    ].join('\r\n'),
    fragment: [
      `// ${marker}`,
      'varying vec2 spot;',
      'uniform sampler2D _BumpMap;',
      `void main() { gl_FragColor = texture2D(_BumpMap, spot) * ${marker}; }`,
    ].join('\r\n'),
  };
}

const anyTexture = async () => new THREE.Texture();

describe('water material', () => {
  it('draws its own fallback until the program and both textures are in', async () => {
    const m = createWaterMaterial();
    expect(m.path).toBe('fallback');
    const asked: string[] = [];
    await attachWaterTextures(m, {
      rawTexture: async (_ref: string, _wrap?: string, kind?: string) => {
        asked.push(kind ?? 'colour');
        return new THREE.Texture();
      },
    } as never);
    // The build's programs reach a material only through the bench, never
    // through the game path above: hand over our own stand-in text directly.
    m.usePrograms({ soft: standInWater('0.5'), plain: standInWater('0.25') });
    expect(m.path).toBe('soft');
    expect(m.uniforms.uHasBump.value).toBe(1);
    expect(m.uniforms.uHasReflection.value).toBe(1);
    expect(m.uniforms._BumpMap.value).toBeInstanceOf(THREE.Texture);
    expect(m.fragmentShader).toContain('* 0.5');
    // Both programs work in display values, so neither image is colour-decoded.
    expect(asked).toEqual(['data', 'data']);
  });

  it('follows the Graphics setting between the two loaded programs', async () => {
    const m = createWaterMaterial();
    await attachWaterTextures(m, { rawTexture: anyTexture } as never);
    m.usePrograms({ soft: standInWater('0.5'), plain: standInWater('0.25') });
    m.uniforms.uSoft.value = 0;
    expect(m.choosePath()).toBe('plain');
    expect(m.fragmentShader).toContain('* 0.25');
  });

  it('keeps the fallback with no program handed over', async () => {
    const m = createWaterMaterial();
    await attachWaterTextures(m, { rawTexture: anyTexture } as never);
    m.usePrograms({ soft: null, plain: null });
    expect(m.path).toBe('fallback');
    expect(m.vertexShader).toContain('attribute float shore;');
  });

  it('keeps the fallback while a texture is missing', async () => {
    const m = createWaterMaterial();
    await attachWaterTextures(m, { rawTexture: async () => null } as never);
    m.usePrograms({ soft: standInWater('0.5'), plain: standInWater('0.25') });
    expect(m.uniforms.uHasBump.value).toBe(0);
    expect(m.path).toBe('fallback');
  });

  it("renames the program's attributes to the geometry's and wraps its entry point", () => {
    const m = createWaterMaterial();
    m.usePrograms({ soft: standInWater('0.5') });
    m.bindBump(new THREE.Texture());
    m.bindReflection(new THREE.Texture());
    expect(m.vertexShader).toContain('attribute vec4 position;');
    expect(m.vertexShader).toContain('attribute vec2 uv;');
    expect(m.vertexShader).not.toMatch(/\bVertex\b/);
    expect(m.vertexShader).not.toContain('\r');
    expect(m.vertexShader.match(/void main\(\)/g)).toHaveLength(1);
    expect(m.fragmentShader.startsWith('precision highp float;')).toBe(true);
  });

  it('feeds the loaded names as it draws: eye, drift and display-space fog', () => {
    const m = createWaterMaterial();
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(new THREE.Color(0.2, 0.2, 0.2), 10, 90);
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(3, 4, 5);
    camera.updateMatrixWorld();
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), m);
    mesh.updateMatrixWorld();
    mesh.modelViewMatrix.multiplyMatrices(camera.matrixWorldInverse, mesh.matrixWorld);
    m.uniforms.uTime.value = 100;
    m.onBeforeRender(null as never, scene, camera, mesh.geometry, mesh);

    const eye = m.uniforms.CameraPosition.value.toArray();
    [3, 4, 5].forEach((v, i) => expect(eye[i]).toBeCloseTo(v, 6));
    const drift = m.uniforms.WaveMapOffset.value;
    expect(drift.x).toBeGreaterThanOrEqual(0);
    expect(drift.x).toBeLessThan(1);
    expect(drift.x).toBeCloseTo((RIPPLE_DRIFT[0][0] * 100) % 1, 6);
    // Linear 0.2 is about 0.48 once encoded for display.
    expect(m.uniforms.fogcolor.value.x).toBeCloseTo(0.484, 2);
    expect(m.uniforms.uSceneFogRange.value.toArray()).toEqual([10, 90]);
    expect(m.uniformsNeedUpdate).toBe(true);
  });
});

describe('the shore fade', () => {
  it('shows nothing at the waterline and everything from the shore depth down', () => {
    expect(shoreAlpha(0)).toBe(0);
    expect(shoreAlpha(-1)).toBe(0);
    expect(shoreAlpha(SHORE_DEPTH)).toBe(1);
    expect(shoreAlpha(SHORE_DEPTH * 4)).toBe(1);
    expect(shoreAlpha(0.3)).toBeGreaterThan(0.2);
  });

  it('carries the fade per vertex: zero where bed meets surface, full in deep water', () => {
    const shallow = buildWaterTile(tile(2, allChunks(2)))!;
    const fade = shallow.geometry.getAttribute('shore');
    for (let i = 0; i < fade.count; i++) expect(fade.getX(i)).toBe(0);

    const deep = buildWaterTile(tile(-4, allChunks(2)))!;
    const full = deep.geometry.getAttribute('shore');
    for (let i = 0; i < full.count; i++) expect(full.getX(i)).toBe(1);
  });

  it('points the depth-map lookup at the same fade the fallback draws', () => {
    // The ramp is two texels, 0 and 1, filtered linearly between their
    // centres; the program reads it at one eighth of the second coordinate.
    const sampleRamp = (u: number): number => Math.min(1, Math.max(0, (u - 0.25) / 0.5));
    for (const alpha of [0, 0.3, 0.75, 1]) {
      const [u, v] = depthCoord(alpha);
      expect(sampleRamp(u / 8)).toBeCloseTo(alpha, 6);
      expect(v / 8).toBe(0.5);
    }
  });
});

describe('water ripple coordinates', () => {
  it('repeats a whole number of times per tile, so neighbouring tiles meet', () => {
    const built = buildWaterTile(tile(-4, allChunks(2)))!;
    const uv = built.geometry.getAttribute('uv');
    const us = [...Array(uv.count)].map((_, i) => uv.getX(i));
    expect(Math.min(...us)).toBe(0);
    expect(Math.max(...us)).toBeCloseTo(RIPPLE_REPEATS_PER_TILE, 6);
    expect(Number.isInteger(RIPPLE_REPEATS_PER_TILE)).toBe(true);
  });
});

describe('swimming physics constants', () => {
  it('damps gravity under water enough to clear the surface', () => {
    // Apex under buoyancy = v^2 / (2 * g * B). It has to exceed the depth the
    // swimmer floats below the surface, or a jump never breaks it.
    const apex = JUMP_START_VELOCITY ** 2 / (2 * Math.abs(GRAVITY) * BUOYANCY);
    expect(BUOYANCY).toBeGreaterThan(0);
    expect(BUOYANCY).toBeLessThan(1);
    expect(apex).toBeGreaterThan(SWIM_DEPTH);
  });
});

describe('bridges over water', () => {
  it('stands on what you are on, not on the lake bed under it', () => {
    // Bed at -10, water surface at 0: deep enough to swim by the heightmap
    // alone. A bridge deck at 2 is above the surface, so you walk.
    const t = new Terrain([tile(-10, allChunks(0))]);
    expect(t.waterStateAt(32, 32).state).toBe('swimming');
    // Told what is actually underfoot, the same spot is dry.
    expect(t.waterStateAt(32, 32, 2).state).toBe('dry');
  });

  it('still wades when the deck is only just under the surface', () => {
    const t = new Terrain([tile(-10, allChunks(0))]);
    expect(t.waterStateAt(32, 32, -0.5).state).toBe('wading');
    expect(t.waterStateAt(32, 32, -SWIM_DEPTH - 0.5).state).toBe('swimming');
  });
});
