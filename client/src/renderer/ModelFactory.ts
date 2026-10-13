/**
 * ModelData -> Three.js. The only place that knows both vocabularies.
 *
 * Everything below it deals in resources; everything above it deals in
 * Object3Ds. No file-format knowledge crosses in either direction.
 */

import * as THREE from 'three';
import type { Appearance, MeshData, ModelData } from '../assets/types';
import type { MaterialCache, MaterialSpec } from './MaterialCache';
import { specKey } from './MaterialCache';
import { isOpenGroup } from './meshOpenness';

export interface BuiltModel {
  object: THREE.Object3D;
  /** Geometries owned by this model, for disposal. Materials are cache-owned. */
  geometries: THREE.BufferGeometry[];
}

/** Build a model group, keeping the appearance's meshes, else the model's `defaultMeshes`. */
export function buildModel(
  model: ModelData,
  materials: MaterialCache,
  appearance?: Appearance,
  at?: readonly [number, number, number],
): BuiltModel {
  const group = new THREE.Group();
  group.name = appearance ? `${model.path}#${appearance.key}` : model.path;
  const geometries: THREE.BufferGeometry[] = [];

  const selection = appearance?.meshes.length ? appearance.meshes : model.defaultMeshes;
  const wanted = selection.length > 0 ? new Set(selection) : null;

  // Meshes placed by an animated node need a real object for the mixer to
  // turn, so their chain is rebuilt instead of baked. One live object per node
  // key, shared by every mesh hanging off it — a windmill's blades are one
  // mesh under `windmill-node`, but a pair of wings is a dozen.
  const hosts = new Map<string, THREE.Object3D>();
  const hostFor = (chain: NonNullable<MeshData['chain']>): THREE.Object3D => {
    // Keyed by the path, not by the last node's name, so two meshes reached
    // through the same nodes share one set of objects while two nodes that
    // happen to share a name under different parents do not collide.
    let path = '';
    let parent: THREE.Object3D = group;
    for (const node of chain) {
      path = path ? `${path}/${node.key}` : node.key;
      const existing = hosts.get(path);
      if (existing) {
        parent = existing;
        continue;
      }
      const object = new THREE.Group();
      object.name = node.key;
      object.applyMatrix4(rowMajor3x4(node.local));
      // A node no clip touches will never move, so it can stay frozen; an
      // animated one has its whole local transform rewritten every frame.
      if (!node.animated) object.matrixAutoUpdate = false;
      parent.add(object);
      hosts.set(path, object);
      parent = object;
    }
    return parent;
  };

  for (const mesh of model.meshes) {
    if (wanted && !wanted.has(mesh.name)) continue;
    const built = buildMesh(mesh, materials, appearance, at);
    if (!built) continue;
    geometries.push(built.geometry);
    (mesh.chain ? hostFor(mesh.chain) : group).add(built.object);
  }

  return { object: group, geometries };
}

/** The reader's row-major 3x4 (translation last) as a `Matrix4`. */
function rowMajor3x4(m: number[]): THREE.Matrix4 {
  return new THREE.Matrix4().set(
    m[0],
    m[1],
    m[2],
    m[9],
    m[3],
    m[4],
    m[5],
    m[10],
    m[6],
    m[7],
    m[8],
    m[11],
    0,
    0,
    0,
    1,
  );
}

/** Apply the baked vertex lighting every model carries (`texture * vColor0`). */
export const modelOptions = { vertexLighting: true };

/**
 * Vertex colours, sRGB bytes in, linear floats out, RGB only (alpha dropped:
 * the blend shader takes alpha from the texture alone, and a 4-component
 * attribute would wrongly fade blended materials).
 */
function toLinearColors(bytes: Uint8Array | undefined, vertexCount: number): Float32Array | null {
  if (!modelOptions.vertexLighting) return null;
  // A mesh without the channel, or one whose channel does not match its vertex
  // count, simply has no vertex colour — never a partial buffer.
  if (!bytes || bytes.length !== vertexCount * 4) return null;
  const out = new Float32Array(vertexCount * 3);
  for (let v = 0; v < vertexCount; v++) {
    out[v * 3] = srgbToLinear(bytes[v * 4] / 255);
    out[v * 3 + 1] = srgbToLinear(bytes[v * 4 + 1] / 255);
    out[v * 3 + 2] = srgbToLinear(bytes[v * 4 + 2] / 255);
  }
  return out;
}

/** The sRGB electro-optical transfer function, as Three's own decode uses. */
function srgbToLinear(c: number): number {
  return c < 0.04045 ? c * 0.0773993808 : Math.pow(c * 0.9478672986 + 0.0521327014, 2.4);
}

function buildMesh(
  mesh: MeshData,
  materials: MaterialCache,
  appearance?: Appearance,
  at?: readonly [number, number, number],
): { object: THREE.Object3D; geometry: THREE.BufferGeometry } | null {
  if (mesh.indices.length === 0 || mesh.positions.length === 0) return null;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
  if (mesh.uvs.length > 0) {
    geometry.setAttribute('uv', new THREE.BufferAttribute(mesh.uvs, 2));
  }
  if (mesh.normals.length === mesh.positions.length) {
    geometry.setAttribute('normal', new THREE.BufferAttribute(mesh.normals, 3));
  }
  const colors = toLinearColors(mesh.colors, mesh.positions.length / 3);
  if (colors) geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const morphNames = applyMorphTargets(geometry, mesh);

  // Blend mode and sidedness come from the group, which got them from the
  // game's shader name. Resolve every group's material spec up front: which of
  // them share one is what decides how many draws this mesh costs.
  const specs = mesh.groups.map(g => ({
    texture: meshTexture(mesh.name, g, appearance),
    blend: g.blend,
    // The name says two-sided sometimes; the geometry says it whenever the
    // group is a card or strip — a bow string, a cape — see `meshOpenness`.
    doubleSided: g.doubleSided || isOpenGroup(mesh.indices, g.start, g.count),
    unlit: g.unlit,
    shader: g.shader,
    // Only when the mesh actually has the channel — asking for vertex
    // colours without a `color` attribute leaves Three multiplying by an
    // undefined varying, which is black on some drivers.
    vertexColors: colors !== null,
  }));
  const { indices, groups } = coalesceGroups(mesh, specs);

  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  coverMorphTargets(geometry);

  // One draw group per *material*, not per submesh: Three.js draws a
  // multi-material mesh from a single geometry, so submeshes cost no extra
  // buffers — but each group it consults is its own `drawElements`.
  const slots: THREE.Material[] = [];
  for (const group of groups) {
    geometry.addGroup(group.start, group.count, slots.length);
    slots.push(materials.get(specs[group.spec], at));
  }

  const object = new THREE.Mesh(geometry, slots.length === 1 ? slots[0] : slots);
  object.name = mesh.name;
  if (morphNames.length > 0) {
    // Resting weights as the controller states them. `maincity_flag_01` opens
    // fully on its second blend shape, not on the base pose, so starting every
    // influence at zero would show a shape the flag never takes.
    object.morphTargetInfluences = mesh.morphTargets!.map(t => t.weight);
    object.morphTargetDictionary = Object.fromEntries(morphNames.map((n, i) => [n, i]));
  }
  return { object, geometry };
}

/** Hand mesh blend shapes to Three as (absolute, base-space) morph attributes.
 * All targets or none (tracks index by position); normals only with a full set. */
function applyMorphTargets(geometry: THREE.BufferGeometry, mesh: MeshData): string[] {
  const targets = mesh.morphTargets ?? [];
  if (targets.length === 0) return [];
  if (!targets.every(t => t.positions.length === mesh.positions.length)) return [];

  geometry.morphTargetsRelative = false;
  geometry.morphAttributes.position = targets.map(t => new THREE.BufferAttribute(t.positions, 3));
  if (targets.every(t => t.normals.length === mesh.positions.length)) {
    geometry.morphAttributes.normal = targets.map(t => new THREE.BufferAttribute(t.normals, 3));
  }
  return targets.map(t => t.name);
}

/** Grow a morphing mesh's bounds to cover every pose, or culling hides a swaying flag. */
function coverMorphTargets(geometry: THREE.BufferGeometry): void {
  const poses = geometry.morphAttributes.position;
  if (!poses || poses.length === 0) return;

  const sphere = geometry.boundingSphere;
  if (sphere) {
    const { x, y, z } = sphere.center;
    for (const attribute of poses) {
      const p = attribute.array;
      for (let i = 0; i < p.length; i += 3) {
        const d = Math.hypot(p[i] - x, p[i + 1] - y, p[i + 2] - z);
        if (d > sphere.radius) sphere.radius = d;
      }
    }
  }

  // `Box3.setFromObject` reads this when it is already computed, and
  // `modelBounds` sizes the prototype's shadow and height from that box.
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  if (!box) return;
  const point = new THREE.Vector3();
  for (const attribute of poses) {
    const p = attribute.array;
    for (let i = 0; i < p.length; i += 3) box.expandByPoint(point.set(p[i], p[i + 1], p[i + 2]));
  }
}

/** A draw: one index range, and which of `specs` it draws with. */
interface DrawGroup {
  start: number;
  count: number;
  spec: number;
}

/**
 * Fold a mesh's submeshes into one draw group per material. Adjacent
 * same-material ranges always merge; non-adjacent ones merge only when every
 * group is opaque/cut-out (reordering past blended surfaces would show).
 */
function coalesceGroups(
  mesh: MeshData,
  specs: MaterialSpec[],
): { indices: Uint16Array | Uint32Array; groups: DrawGroup[] } {
  const keys = specs.map(specKey);

  // Adjacent-only merge, order-preserving, no reordering of anything.
  const runs: DrawGroup[] = [];
  for (let i = 0; i < mesh.groups.length; i++) {
    const g = mesh.groups[i];
    const last = runs[runs.length - 1];
    // Contiguity is checked rather than assumed: a gap between two ranges is
    // not ours to swallow, however unlikely the reader is to produce one.
    if (last && keys[last.spec] === keys[i] && last.start + last.count === g.start) {
      last.count += g.count;
      continue;
    }
    runs.push({ start: g.start, count: g.count, spec: i });
  }

  const reorderable = specs.every(s => s.blend === 'opaque' || s.blend === 'cutout');
  if (!reorderable || runs.length < 2) return { indices: mesh.indices, groups: runs };

  // Gather runs by material, first appearance first, and rewrite the index
  // buffer to match. Relative order *within* a material is preserved.
  const byKey = new Map<string, DrawGroup[]>();
  for (const run of runs) {
    const key = keys[run.spec];
    const bucket = byKey.get(key);
    if (bucket) bucket.push(run);
    else byKey.set(key, [run]);
  }
  if (byKey.size === runs.length) return { indices: mesh.indices, groups: runs };

  let covered = 0;
  for (const run of runs) covered += run.count;
  // Same width as the source. A 16-bit index buffer stays 16-bit: widening it
  // here would double the memory of every small mesh for nothing, since
  // regrouping never introduces an index the mesh did not already hold.
  const indices =
    mesh.indices instanceof Uint16Array ? new Uint16Array(covered) : new Uint32Array(covered);
  const groups: DrawGroup[] = [];
  let at = 0;
  for (const bucket of byKey.values()) {
    const start = at;
    for (const run of bucket) {
      indices.set(mesh.indices.subarray(run.start, run.start + run.count), at);
      at += run.count;
    }
    groups.push({ start, count: at - start, spec: bucket[0].spec });
  }
  return { indices, groups };
}

/**
 * Materials whose geometry is UV-mapped onto the composited body atlas.
 */
const SHEET_MATERIALS = new Set(['body', 'skirt']);

/** Body images the composited atlas is meant to stand in for. */
const BODY_TEXTURE = /_body_\d+\.tga$/i;

/** Texture for a group under a composited skin: colour-variant replaces
 * all; body atlas replaces body refs and fills textureless atlas materials.
 * Unnamed materials count as atlas materials. */
export function skinnedTexture(
  texture: string | null,
  material: string,
  appearance?: Appearance,
): string | null {
  const hair = hairVariant(texture, material, appearance);
  if (hair) return hair;
  const skin = appearance?.skin;
  if (!skin) return texture;
  if (appearance.skinReplacesAll) return skin;
  if (texture) return BODY_TEXTURE.test(texture) ? skin : texture;
  return SHEET_MATERIALS.has(material.toLowerCase()) || material === '' ? skin : null;
}

/** Texture for one group of a named mesh: the appearance's own art for that
 * mesh, when it names one, and otherwise `skinnedTexture`. */
export function meshTexture(
  meshName: string,
  group: { texture: string | null; material: string },
  appearance?: Appearance,
): string | null {
  return (
    appearance?.meshTextures?.[meshName] ??
    skinnedTexture(group.texture, group.material, appearance)
  );
}

const HAIR_MATERIAL = /^hair_[ab]$/;
const HAIR_VARIANT = /_(\d{2})\.tga$/i;

/** Pick the hair texture for the character's hair colour (one texture per
 * colour, variants 1-8; decode-time default is `_01`, corrected here where the
 * character is known; out-of-range falls back to the decoded texture). */
function hairVariant(
  texture: string | null,
  material: string,
  appearance?: Appearance,
): string | null {
  const colour = appearance?.hairColor;
  if (!texture || !colour) return null;
  if (!HAIR_MATERIAL.test(material.toLowerCase())) return null;
  if (!HAIR_VARIANT.test(texture)) return null;
  if (!Number.isInteger(colour) || colour < 1 || colour > 8) return null;
  return texture.replace(HAIR_VARIANT, `_0${colour}.tga`);
}
