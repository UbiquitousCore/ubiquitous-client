/**
 * The renderer adapter: resource in, Three.js out. Runs headless — building
 * scene graph objects needs no WebGL context, only creating a WebGLRenderer
 * would, and that is deliberately not exercised here.
 */

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';

import { buildModel, skinnedTexture } from '../src/renderer/ModelFactory';
import { toThreeClip } from '../src/renderer/SkinnedModelFactory';
import { isLightShaft, toSurface } from '../src/assets/providers/surface';
import { buildTerrainTile } from '../src/renderer/TerrainFactory';
import type { MeshData, ModelData, TerrainTileData } from '../src/assets/types';

/** Stands in for MaterialCache without touching the network or the GPU. */
type Spec = import('../src/renderer/MaterialCache').MaterialSpec;
const specs: Spec[] = [];
const textures = {
  get: (spec: Spec) => {
    specs.push(spec);
    const m = spec.unlit ? new THREE.MeshBasicMaterial() : new THREE.MeshLambertMaterial();
    m.name = `${spec.texture ?? '-'}|${spec.blend}|${spec.doubleSided ? '2s' : '1s'}`;
    m.side = spec.doubleSided ? THREE.DoubleSide : THREE.FrontSide;
    return m;
  },
  uploadedCount: 0,
  pendingCount: 0,
  dispose: () => {},
} as unknown as import('../src/renderer/MaterialCache').MaterialCache;

const OPAQUE = {
  blend: 'opaque' as const,
  doubleSided: false,
  unlit: true,
  shader: 'unlit_textured_solid',
};

function quad(name: string, texture: string | null): MeshData {
  return {
    name,
    positions: new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]),
    normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]),
    uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
    // White: the shipped shaders are `texture * vColor0`, so white is the
    // neutral that leaves a fixture's texture alone.
    colors: new Uint8Array(new Array(4 * 4).fill(255)),
    indices: new Uint16Array([0, 1, 2, 0, 2, 3]),
    groups: [{ start: 0, count: 6, texture, material: 'mat', ...OPAQUE }],
  };
}

function model(meshes: MeshData[], defaultMeshes: string[] = []): ModelData {
  return { path: 'model/test.bdae', meshes, defaultMeshes };
}

describe('buildModel', () => {
  it('uploads the index array it was given, without widening it', () => {
    // A `.bdae` stores 16-bit indices and the reader rejects any that reach
    // the vertex count, so a 32-bit copy is twice the array and twice the GPU
    // upload for no reachable value. This pins that nothing re-widens it on
    // the way to the geometry.
    const built = buildModel(model([quad('a', 't.tga')]), textures);
    const index = (built.object.children[0] as THREE.Mesh).geometry.getIndex();

    expect(index).not.toBeNull();
    expect(index!.array).toBeInstanceOf(Uint16Array);
    expect(index!.array.byteLength).toBe(12);
  });

  it('produces one child mesh per submesh, with the geometry attached', () => {
    const built = buildModel(model([quad('a', 't.tga'), quad('b', null)]), textures);

    expect(built.object.children).toHaveLength(2);
    expect(built.geometries).toHaveLength(2);

    const first = built.object.children[0] as THREE.Mesh;
    expect(first.geometry.getAttribute('position').count).toBe(4);
    expect(first.geometry.getIndex()!.count).toBe(6);
    expect(first.geometry.getAttribute('uv').count).toBe(4);
  });

  it('honours defaultMeshes, so a character wears one outfit not all of them', () => {
    const built = buildModel(
      model([quad('hair_a', null), quad('hair_b', null), quad('body', null)], ['body', 'hair_a']),
      textures,
    );

    expect(built.object.children.map(c => c.name).sort()).toEqual(['body', 'hair_a']);
  });

  it('gives a mesh the appearance names a texture for that texture, whatever its material', () => {
    specs.length = 0;
    const onSheet = (name: string): MeshData => {
      const mesh = quad(name, 'human_f_body_01.tga');
      return { ...mesh, groups: [{ ...mesh.groups[0], material: 'body' }] };
    };
    buildModel(model([onSheet('cape_02-mesh'), onSheet('body_01-mesh')]), textures, {
      skin: 'atlas',
      meshes: [],
      skinReplacesAll: false,
      meshTextures: { 'cape_02-mesh': 'texture/avatar/cape.tga' },
      key: 'k',
    });
    expect(specs.map(s => s.texture)).toEqual(['texture/avatar/cape.tga', 'atlas']);
  });

  it('draws every mesh when no default selection is given', () => {
    const built = buildModel(model([quad('a', null), quad('b', null)]), textures);
    expect(built.object.children).toHaveLength(2);
  });

  it('keeps supplied normals rather than recomputing them', () => {
    const built = buildModel(model([quad('a', null)]), textures);
    const geometry = (built.object.children[0] as THREE.Mesh).geometry;
    const normals = geometry.getAttribute('normal');
    expect(normals.count).toBe(4);
    expect(normals.getZ(0)).toBeCloseTo(1, 5);
  });

  it('computes normals when the model ships none', () => {
    const mesh = quad('a', null);
    mesh.normals = new Float32Array(0);
    const built = buildModel(model([mesh]), textures);
    const geometry = (built.object.children[0] as THREE.Mesh).geometry;
    expect(geometry.getAttribute('normal')).toBeDefined();
  });

  it('skips a mesh with no indices instead of emitting an empty draw', () => {
    const empty = quad('empty', null);
    empty.indices = new Uint32Array(0);
    const built = buildModel(model([empty, quad('real', null)]), textures);
    expect(built.object.children.map(c => c.name)).toEqual(['real']);
  });

  it('passes the group blend mode and sidedness through to the material', () => {
    specs.length = 0;
    const mesh = quad('foliage', 'leaf.tga');
    mesh.groups = [
      {
        start: 0,
        count: 6,
        texture: 'leaf.tga',
        material: 'leaf',
        blend: 'cutout',
        doubleSided: true,
        unlit: true,
        shader: 'unlit_textured_cutout',
      },
    ];
    buildModel(model([mesh]), textures);
    expect(specs.at(-1)).toMatchObject({
      texture: 'leaf.tga',
      blend: 'cutout',
      doubleSided: true,
      unlit: true,
    });
  });

  it('maps multiple groups onto material slots in one geometry', () => {
    const mesh = quad('multi', 'a.tga');
    mesh.groups = [
      { start: 0, count: 3, texture: 'a.tga', material: 'a', ...OPAQUE },
      { start: 3, count: 3, texture: 'b.tga', material: 'b', ...OPAQUE },
    ];
    const built = buildModel(model([mesh]), textures);
    const three = built.object.children[0] as THREE.Mesh;

    expect(Array.isArray(three.material)).toBe(true);
    expect(three.geometry.groups).toHaveLength(2);
    expect(three.geometry.groups[1]).toMatchObject({ start: 3, count: 3, materialIndex: 1 });
  });
});

/**
 * A submesh is a draw. Two submeshes naming the same material are two draws
 * for one state, and a building is mostly walls: coalescing them is pure
 * draw-count reduction with nothing visible attached to it.
 *
 * Mesh identity is deliberately untouched. Effects legitimately attach to a
 * *mesh* by name (`Renderer.attachEffect`'s uid fallback) and a mesh fade
 * fades a named drawable subtree, so merging sibling meshes would silently
 * break both. This stays inside one mesh.
 */
describe('buildMesh group coalescing', () => {
  const BLEND = {
    blend: 'blend' as const,
    doubleSided: false,
    unlit: true,
    shader: 'unlit_textured_blend',
  };

  it('coalesces adjacent groups that resolve to the same material', () => {
    const mesh = quad('wall', 'a.tga');
    mesh.groups = [
      { start: 0, count: 3, texture: 'a.tga', material: 'a', ...OPAQUE },
      { start: 3, count: 3, texture: 'a.tga', material: 'a', ...OPAQUE },
    ];
    const built = buildModel(model([mesh]), textures);
    const three = built.object.children[0] as THREE.Mesh;

    // One material, so Three ignores groups entirely: a single draw.
    expect(Array.isArray(three.material)).toBe(false);
    expect([...(three.geometry.getIndex()!.array as Uint32Array)]).toEqual([0, 1, 2, 0, 2, 3]);
  });

  it('asks the cache once per distinct material, not once per group', () => {
    specs.length = 0;
    const mesh = quad('wall', 'a.tga');
    mesh.groups = [
      { start: 0, count: 2, texture: 'a.tga', material: 'a', ...OPAQUE },
      { start: 2, count: 2, texture: 'a.tga', material: 'a', ...OPAQUE },
      { start: 4, count: 2, texture: 'a.tga', material: 'a', ...OPAQUE },
    ];
    buildModel(model([mesh]), textures);
    expect(specs).toHaveLength(1);
  });

  it('gathers non-adjacent opaque groups sharing a material into one draw', () => {
    // a, b, a. Coalescing the two `a` ranges means reordering the index
    // buffer, which is safe precisely because every group here is opaque:
    // the depth buffer decides what wins, so triangle order cannot be seen.
    const mesh = quad('wall', 'a.tga');
    mesh.indices = new Uint32Array([0, 1, 2, 0, 2, 3, 1, 2, 3]);
    mesh.groups = [
      { start: 0, count: 3, texture: 'a.tga', material: 'a', ...OPAQUE },
      { start: 3, count: 3, texture: 'b.tga', material: 'b', ...OPAQUE },
      { start: 6, count: 3, texture: 'a.tga', material: 'a', ...OPAQUE },
    ];
    const built = buildModel(model([mesh]), textures);
    const three = built.object.children[0] as THREE.Mesh;

    expect(three.geometry.groups).toHaveLength(2);
    expect(three.geometry.groups[0]).toMatchObject({ start: 0, count: 6, materialIndex: 0 });
    expect(three.geometry.groups[1]).toMatchObject({ start: 6, count: 3, materialIndex: 1 });
    // Both `a` ranges now sit together at the front, each range's own winding
    // preserved — the same triangles, regrouped.
    expect([...(three.geometry.getIndex()!.array as Uint32Array)]).toEqual([
      0, 1, 2, 1, 2, 3, 0, 2, 3,
    ]);
  });

  it('leaves the index buffer alone when a blended group is present', () => {
    // Order is visible through a blended surface, so nothing is reordered
    // around one. The two opaque `a` ranges stay as separate draws.
    const mesh = quad('window', 'a.tga');
    mesh.indices = new Uint32Array([0, 1, 2, 0, 2, 3, 1, 2, 3]);
    mesh.groups = [
      { start: 0, count: 3, texture: 'a.tga', material: 'a', ...OPAQUE },
      { start: 3, count: 3, texture: 'glass.tga', material: 'g', ...BLEND },
      { start: 6, count: 3, texture: 'a.tga', material: 'a', ...OPAQUE },
    ];
    const built = buildModel(model([mesh]), textures);
    const three = built.object.children[0] as THREE.Mesh;

    expect(three.geometry.groups).toHaveLength(3);
    expect([...(three.geometry.getIndex()!.array as Uint32Array)]).toEqual([
      0, 1, 2, 0, 2, 3, 1, 2, 3,
    ]);
  });

  it('still coalesces adjacent duplicates when a blended group is present', () => {
    // Adjacent runs need no reordering, so the blended group does not block
    // them — it only blocks the gather that would move triangles past it.
    const mesh = quad('window', 'a.tga');
    mesh.indices = new Uint32Array([0, 1, 2, 0, 2, 3, 1, 2, 3]);
    mesh.groups = [
      { start: 0, count: 3, texture: 'a.tga', material: 'a', ...OPAQUE },
      { start: 3, count: 3, texture: 'a.tga', material: 'a', ...OPAQUE },
      { start: 6, count: 3, texture: 'glass.tga', material: 'g', ...BLEND },
    ];
    const built = buildModel(model([mesh]), textures);
    const three = built.object.children[0] as THREE.Mesh;

    expect(three.geometry.groups).toHaveLength(2);
    expect(three.geometry.groups[0]).toMatchObject({ start: 0, count: 6, materialIndex: 0 });
    expect([...(three.geometry.getIndex()!.array as Uint32Array)]).toEqual([
      0, 1, 2, 0, 2, 3, 1, 2, 3,
    ]);
  });

  it('keeps groups apart when only their blend mode differs', () => {
    // Same image, different compositing — not the same material, not one draw.
    const mesh = quad('mixed', 'a.tga');
    mesh.groups = [
      { start: 0, count: 3, texture: 'a.tga', material: 'a', ...OPAQUE },
      { start: 3, count: 3, texture: 'a.tga', material: 'a', ...BLEND },
    ];
    const built = buildModel(model([mesh]), textures);
    const three = built.object.children[0] as THREE.Mesh;
    expect(three.geometry.groups).toHaveLength(2);
  });

  it('keeps a group whose indices are not contiguous with the last one', () => {
    // Defensive: the reader concatenates submesh indices so groups always
    // tile the buffer, but a gap must not be silently swallowed into a
    // neighbouring range.
    const mesh = quad('gapped', 'a.tga');
    mesh.indices = new Uint32Array([0, 1, 2, 0, 2, 3, 1, 2, 3]);
    mesh.groups = [
      { start: 0, count: 3, texture: 'a.tga', material: 'a', ...OPAQUE },
      { start: 6, count: 3, texture: 'a.tga', material: 'a', ...BLEND },
    ];
    const built = buildModel(model([mesh]), textures);
    const three = built.object.children[0] as THREE.Mesh;
    expect(three.geometry.groups.map(g => ({ start: g.start, count: g.count }))).toEqual([
      { start: 0, count: 3 },
      { start: 6, count: 3 },
    ]);
  });
});

describe('skinnedTexture', () => {
  const atlas = { skin: '/api/skin?creature=1', meshes: [], skinReplacesAll: false, key: 'k' };
  const variant = { skin: 'green.tga', meshes: [], skinReplacesAll: true, key: 'v' };

  it('leaves a model alone when it has no appearance', () => {
    expect(skinnedTexture('a.tga', 'body', undefined)).toBe('a.tga');
  });

  it('replaces a body image with the composited atlas', () => {
    // orc_m_h.bdae ships human_m_body_01.tga on its body, cape, arms and legs.
    // Keeping the model's own texture is what made orcs look human.
    expect(skinnedTexture('human_m_body_01.tga', 'body', atlas)).toBe(atlas.skin);
    expect(skinnedTexture('orc_m_body_01.tga', 'skirt', atlas)).toBe(atlas.skin);
  });

  it('keeps a non-body texture even when an atlas exists', () => {
    // Hair has its own image and must not be overwritten by the body atlas.
    expect(skinnedTexture('orc_m_hair_b_01.tga', 'hair_b', atlas)).toBe('orc_m_hair_b_01.tga');
  });

  it('fills in for an atlas material that names no texture', () => {
    // From 1.1.4 on, human_m_h ships no images at all.
    expect(skinnedTexture(null, 'body', atlas)).toBe(atlas.skin);
    expect(skinnedTexture(null, '', atlas)).toBe(atlas.skin);
  });

  it('does not hand the body atlas to an unrelated untextured material', () => {
    expect(skinnedTexture(null, 'cape', atlas)).toBeNull();
  });

  it('lets a colour variant replace everything', () => {
    expect(skinnedTexture('puppy_squirrel_orange.tga', 'body', variant)).toBe('green.tga');
    expect(skinnedTexture('anything.tga', 'hair_b', variant)).toBe('green.tga');
  });
});

function terrainTile(over: Partial<TerrainTileData> = {}): TerrainTileData {
  return {
    tile: [0, 0],
    origin: [0, 0],
    side: 3,
    tileSize: 64,
    heights: Float32Array.from([0, 0, 0, 0, 5, 0, 0, 0, 0]),
    colours: null,
    visible: [],
    // Empty rather than absent: the type says an empty list is a tile that
    // carries none, which is what these fixtures are.
    water: [],
    chunkTextures: [],
    baseTexture: null,
    maskTexture: null,
    ...over,
  };
}

describe('buildTerrainTile', () => {
  it('meshes a height grid at world coordinates', () => {
    const built = buildTerrainTile(terrainTile({ origin: [64, 128] }), textures)!;
    const position = built.geometry.getAttribute('position');

    expect(position.count).toBe(9);
    // First vertex sits at the tile origin; last at origin + tileSize.
    expect(position.getX(0)).toBeCloseTo(64, 5);
    expect(position.getZ(0)).toBeCloseTo(128, 5);
    expect(position.getX(8)).toBeCloseTo(64 + 64, 5);
    expect(position.getZ(8)).toBeCloseTo(128 + 64, 5);
    // Height comes from the grid.
    expect(position.getY(4)).toBeCloseTo(5, 5);
  });

  it('emits two triangles per quad', () => {
    const built = buildTerrainTile(terrainTile(), textures)!;
    // A 3x3 grid is 2x2 quads = 4 quads = 8 triangles = 24 indices.
    expect(built.geometry.getIndex()!.count).toBe(24);
  });

  it('leaves invisible chunks out of the index buffer rather than drawing them', () => {
    // 3x3 grid over 8x8 chunks: every quad lands in chunk 0.
    const hidden = buildTerrainTile(terrainTile({ visible: [false] }), textures);
    expect(hidden).toBeNull();
  });

  it('carries per-vertex tint when the tile has one', () => {
    const built = buildTerrainTile(
      terrainTile({ colours: Uint16Array.from(new Array(9).fill(0xf800)) }),
      textures,
    )!;
    const colour = built.geometry.getAttribute('color');
    expect(colour.count).toBe(9);
    expect(colour.getX(0)).toBeCloseTo(1, 1); // full red
    expect(colour.getY(0)).toBeCloseTo(0, 5);
  });

  it('maps the baked tile image across the tile exactly once', () => {
    // The server bakes one 512x512 image per tile covering its whole 8x8
    // chunk grid, so UVs must span 0..1. Repeating them tiles a miniature
    // copy of the terrain across every tile -- the bug this pins.
    const built = buildTerrainTile(terrainTile(), textures)!;
    const uv = built.geometry.getAttribute('uv');

    expect(uv.getX(0)).toBeCloseTo(0, 6);
    expect(uv.getY(0)).toBeCloseTo(0, 6);
    // Last vertex of a 3x3 grid is the far corner.
    expect(uv.getX(8)).toBeCloseTo(1, 6);
    expect(uv.getY(8)).toBeCloseTo(1, 6);
    // Nothing may exceed the [0,1] range.
    for (let i = 0; i < uv.count; i++) {
      expect(uv.getX(i)).toBeLessThanOrEqual(1);
      expect(uv.getY(i)).toBeLessThanOrEqual(1);
    }
  });

  it('asks for a clamped, vertex-tinted, opaque ground material', () => {
    specs.length = 0;
    buildTerrainTile(terrainTile({ baseTexture: 'g.png' }), textures);
    expect(specs.at(-1)).toMatchObject({
      texture: 'g.png',
      blend: 'opaque',
      doubleSided: false,
      vertexColors: true,
      clampTexture: true,
    });
  });

  it('rejects a degenerate tile instead of producing a broken mesh', () => {
    expect(buildTerrainTile(terrainTile({ side: 1 }), textures)).toBeNull();
    expect(
      buildTerrainTile(terrainTile({ heights: Float32Array.from([1, 2]) }), textures),
    ).toBeNull();
  });
});

describe('hair colour', () => {
  const appearance = (hairColor?: number) => ({
    skin: null,
    meshes: [],
    skinReplacesAll: false,
    hairColor,
    key: 'k',
  });

  it('picks the variant the character actually wears', () => {
    // The build ships one texture per hair colour, `_01` to `_08`. The model
    // decoder cannot know which -- it runs before any appearance exists -- so
    // it resolves `_01`, and colour 1 is indigo on human hair. Every character
    // wore it until this ran.
    expect(skinnedTexture('texture/avatar/human_f_hair_b_01.tga', 'hair_b', appearance(6))).toBe(
      'texture/avatar/human_f_hair_b_06.tga',
    );
    expect(skinnedTexture('texture/avatar/mendel_m_hair_a_01.tga', 'hair_a', appearance(3))).toBe(
      'texture/avatar/mendel_m_hair_a_03.tga',
    );
  });

  it('leaves everything that is not hair alone', () => {
    // A cape is numbered the same way and must not be re-pointed by a hair
    // colour -- `human_long_cape` ships variant 1 only.
    expect(skinnedTexture('texture/avatar/human_long_cape_01.tga', 'cape', appearance(6))).toBe(
      'texture/avatar/human_long_cape_01.tga',
    );
    expect(skinnedTexture('texture/building_roof_06.tga', 'body', appearance(6))).toBe(
      'texture/building_roof_06.tga',
    );
  });

  it('refuses a colour outside the shipped range rather than naming a missing file', () => {
    for (const bad of [0, 9, -1, 2.5, Number.NaN]) {
      expect(
        skinnedTexture('texture/avatar/human_f_hair_b_01.tga', 'hair_b', appearance(bad)),
      ).toBe('texture/avatar/human_f_hair_b_01.tga');
    }
  });

  it('does nothing without an appearance', () => {
    expect(skinnedTexture('texture/avatar/human_f_hair_b_01.tga', 'hair_b', undefined)).toBe(
      'texture/avatar/human_f_hair_b_01.tga',
    );
  });
});

describe('cutout surfaces are two-sided', () => {
  it('draws trans_solid from both sides', () => {
    // Hair, ears and worn items are open shells -- hair meshes in the packs
    // carry 29-64% boundary edges. Culled, they vanish
    // from behind and a head reads as hollow.
    expect(
      toSurface({ file: 'unlit_textured_trans_solid.bdae', shader: '', transparent: false }),
    ).toMatchObject({ blend: 'cutout', doubleSided: true });
  });

  it('leaves the plain solid family one-sided', () => {
    expect(
      toSurface({ file: 'unlit_textured_solid.bdae', shader: '', transparent: false }),
    ).toMatchObject({ blend: 'opaque', doubleSided: false });
    expect(
      toSurface({ file: 'unlit_textured_solid_2sides.bdae', shader: '', transparent: false }),
    ).toMatchObject({ doubleSided: true });
  });
});

describe('light shafts', () => {
  it('knows a shaft by the mesh the art names light, or a sunshine texture', () => {
    expect(isLightShaft('light-mesh', 'texture/Genera_sunshine.tga')).toBe(true);
    expect(isLightShaft('light02-mesh', 'texture/other_alpha.tga')).toBe(true);
    expect(isLightShaft('light004-mesh', null)).toBe(true);
    expect(isLightShaft('Cylinder002-mesh', 'texture/tiles/Genera_sunshine.tga')).toBe(true);
  });

  it('leaves every other blended surface alone', () => {
    // A lighthouse, a lamp post and a leaf are not shafts of light.
    expect(isLightShaft('lighthouse-mesh', 'texture/building_lighthouse.tga')).toBe(false);
    expect(isLightShaft('Object001-mesh', 'texture/leaf01.tga')).toBe(false);
    expect(isLightShaft('Plane017-mesh', 'texture/other_alpha.tga')).toBe(false);
  });
});

/**
 * Blend shapes. The reader hands `MeshData` whole *absolute* poses in
 * the mesh's own space; this is the half that turns them into something Three
 * will actually interpolate.
 */
describe('morph targets', () => {
  /** The quad above, lifted along y by `dy` at its top two vertices. */
  function pose(name: string, dy: number, weight: number) {
    return {
      name,
      positions: new Float32Array([0, 0, 0, 1, 0, 0, 1, 1 + dy, 0, 0, 1 + dy, 0]),
      normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]),
      weight,
    };
  }

  function flag(...targets: ReturnType<typeof pose>[]): MeshData {
    return { ...quad('flag-mesh', 't.tga'), morphTargets: targets };
  }

  it('uploads every pose as an absolute morph attribute', () => {
    const built = buildModel(model([flag(pose('up', 0.5, 0), pose('down', -0.5, 1))]), textures);
    const mesh = built.object.getObjectByName('flag-mesh') as THREE.Mesh;

    expect(mesh.geometry.morphAttributes.position).toHaveLength(2);
    expect(mesh.geometry.morphAttributes.normal).toHaveLength(2);
    // Absolute, not differential: Three then computes
    // `base + sum w*(target - base)`, the COLLADA NORMALIZED blend.
    expect(mesh.geometry.morphTargetsRelative).toBe(false);
    expect(mesh.geometry.morphAttributes.position![0].array[7]).toBeCloseTo(1.5);
  });

  it('starts each weight where the controller rests it, not at zero', () => {
    // `maincity_flag_01` opens fully on its second pose. Zeroing every
    // influence would show a shape the flag never takes.
    const built = buildModel(model([flag(pose('up', 0.5, 0), pose('down', -0.5, 1))]), textures);
    const mesh = built.object.getObjectByName('flag-mesh') as THREE.Mesh;
    expect(mesh.morphTargetInfluences).toEqual([0, 1]);
    expect(mesh.morphTargetDictionary).toEqual({ up: 0, down: 1 });
  });

  it('grows the bounds to cover the swing', () => {
    // Three measures bounds from the base pose alone, and both culling and
    // picking read them — so a flag lifted past its resting box would blink
    // out at the edge of the screen.
    const built = buildModel(model([flag(pose('up', 0.5, 0))]), textures);
    const mesh = built.object.getObjectByName('flag-mesh') as THREE.Mesh;
    expect(mesh.geometry.boundingBox!.max.y).toBeCloseTo(1.5);
    expect(mesh.geometry.boundingSphere!.radius).toBeGreaterThan(
      new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 1, 0)).getBoundingSphere(
        new THREE.Sphere(),
      ).radius,
    );
  });

  it('takes all the poses or none, so a track cannot address the wrong one', () => {
    // A weight track names its pose by index. Dropping a short target and
    // keeping the rest would silently re-point every track after it.
    const short = { ...pose('short', 0.5, 0), positions: new Float32Array([0, 0, 0]) };
    const built = buildModel(model([flag(pose('up', 0.5, 0), short)]), textures);
    const mesh = built.object.getObjectByName('flag-mesh') as THREE.Mesh;
    expect(mesh.geometry.morphAttributes.position).toBeUndefined();
    expect(mesh.morphTargetInfluences).toBeUndefined();
  });

  it('skips normals when only some poses carry them', () => {
    // Half-morphed shading reads worse than none: the base normals then stand
    // for the whole blend, which at cloth amplitudes is barely visible.
    const bare = { ...pose('bare', -0.5, 0), normals: new Float32Array(0) };
    const built = buildModel(model([flag(pose('up', 0.5, 0), bare)]), textures);
    const mesh = built.object.getObjectByName('flag-mesh') as THREE.Mesh;
    expect(mesh.geometry.morphAttributes.position).toHaveLength(2);
    expect(mesh.geometry.morphAttributes.normal).toBeUndefined();
  });

  it('leaves a mesh with no poses exactly as it was', () => {
    const built = buildModel(model([quad('plain', 't.tga')]), textures);
    const mesh = built.object.getObjectByName('plain') as THREE.Mesh;
    expect(mesh.geometry.morphAttributes.position).toBeUndefined();
    expect(mesh.morphTargetInfluences).toBeUndefined();
    expect(mesh.morphTargetDictionary).toBeUndefined();
  });

  it('a real mixer moves the weight the clip names', () => {
    // The end of the chain, without a pack: a weight track addresses a mesh
    // and one of its influences by index, and Three's `PropertyBinding`
    // resolves that path against what `buildModel` left on the mesh. Binding
    // is silent when the path does not resolve, so nothing short of driving it
    // proves the two halves agree.
    const data = model([flag(pose('up', 0.5, 0), pose('down', -0.5, 1))]);
    const built = buildModel(data, textures);
    const mesh = built.object.getObjectByName('flag-mesh') as THREE.Mesh;

    const clip = toThreeClip({
      name: 'sway',
      duration: 2,
      tracks: [
        {
          bone: 'flag-mesh',
          property: 'morphInfluence',
          morphIndex: 1,
          times: new Float32Array([0, 2]),
          values: new Float32Array([1, 0]),
        },
      ],
    });
    expect(clip.tracks[0].name).toBe('flag-mesh.morphTargetInfluences[1]');
    expect(clip.tracks[0]).toBeInstanceOf(THREE.NumberKeyframeTrack);

    const mixer = new THREE.AnimationMixer(built.object);
    mixer.clipAction(clip).play();
    mixer.update(1);
    expect(mesh.morphTargetInfluences![1]).toBeCloseTo(0.5, 5);
    // The pose it was never told to touch stays where the controller left it.
    expect(mesh.morphTargetInfluences![0]).toBe(0);

    // And on a clone, which is what the renderer actually drives: a prototype
    // is built once and every placement of it is `object.clone(true)`. The
    // influences have to be the clone's own array, or every flag in a town
    // would sway in lockstep through one shared one.
    const copy = built.object.clone(true);
    const copied = copy.getObjectByName('flag-mesh') as THREE.Mesh;
    expect(copied.morphTargetInfluences).not.toBe(mesh.morphTargetInfluences);
    const copyMixer = new THREE.AnimationMixer(copy);
    copyMixer.clipAction(clip).play();
    copyMixer.update(1.5);
    expect(copied.morphTargetInfluences![1]).toBeCloseTo(0.25, 5);
    expect(mesh.morphTargetInfluences![1]).toBeCloseTo(0.5, 5);
  });
});
