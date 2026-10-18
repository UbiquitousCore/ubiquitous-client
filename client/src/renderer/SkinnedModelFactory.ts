/** SkeletonData + ModelData to a Three skinned model (row-major floats via
 * fromArray transpose correctly into column-major; inverse binds applied). */

import * as THREE from 'three';
import type { AnimationClipData, ModelData, SkeletonData } from '../assets/types';
import { meshTexture } from './ModelFactory';
import type { MaterialCache } from './MaterialCache';
import type { Appearance } from '../assets/types';
import { isOpenGroup } from './meshOpenness';

export interface BuiltSkinnedModel {
  object: THREE.Object3D;
  geometries: THREE.BufferGeometry[];
  /** Root bones, so a clone can rebind to its own copy. */
  skeleton: THREE.Skeleton | null;
}

/**
 * Build a skinned model. Falls back to returning null when the skeleton has
 * no skin for any drawn mesh, in which case the caller should build a plain
 * static model instead.
 */
export function buildSkinnedModel(
  model: ModelData,
  skeletonData: SkeletonData,
  materials: MaterialCache,
  appearance?: Appearance,
  at?: readonly [number, number, number],
): BuiltSkinnedModel | null {
  const skinByMesh = new Map(skeletonData.skins.map(s => [s.mesh, s]));

  const selection = appearance?.meshes.length ? appearance.meshes : model.defaultMeshes;
  const wanted = selection.length > 0 ? new Set(selection) : null;
  const drawn = model.meshes.filter(m => !wanted || wanted.has(m.name));
  if (!drawn.some(m => skinByMesh.has(m.name))) return null;

  const { bones, roots } = buildBones(skeletonData);

  const group = new THREE.Group();
  group.name = appearance ? `${model.path}#${appearance.key}` : model.path;
  for (const root of roots) group.add(root);

  const geometries: THREE.BufferGeometry[] = [];
  const skinned: SkinnedPart[] = [];

  for (const mesh of drawn) {
    const skin = skinByMesh.get(mesh.name);
    const geometry = buildGeometry(mesh);

    const slots = mesh.groups.map(g =>
      materials.get(
        {
          texture: meshTexture(mesh.name, g, appearance),
          blend: g.blend,
          // As in `ModelFactory`: an open group draws both faces whatever its name.
          doubleSided: g.doubleSided || isOpenGroup(mesh.indices, g.start, g.count),
          unlit: g.unlit,
          shader: g.shader,
        },
        at,
      ),
    );
    for (let i = 0; i < mesh.groups.length; i++) {
      const g = mesh.groups[i];
      geometry.addGroup(g.start, g.count, i);
    }
    const material = slots.length === 1 ? slots[0] : slots;

    if (!skin) {
      // An unskinned mesh on a skinned model (props, effects) just rides the
      // group transform; a rigid cape rides the back instead (`rigidCapeBone`).
      geometries.push(geometry);
      const plain = new THREE.Mesh(geometry, material);
      plain.name = mesh.name;
      const back = isCape(mesh.name) ? rigidCapeBone(bones, group) : null;
      if (back) {
        // Its vertices are where the file's rest pose puts them: kept there
        // relative to the bone, it follows the torso as the body moves.
        plain.applyMatrix4(back.matrixWorld.clone().invert());
        back.add(plain);
      } else {
        group.add(plain);
      }
      continue;
    }

    const vertexCount = mesh.positions.length / 3;
    geometry.setAttribute(
      'skinIndex',
      new THREE.BufferAttribute(fit(skin.skinIndices, vertexCount * 4, Uint16Array), 4),
    );
    geometry.setAttribute(
      'skinWeight',
      new THREE.BufferAttribute(normaliseWeights(skin.skinWeights, vertexCount), 4),
    );

    // Three.js indexes bones through the mesh's own bone list, so give each
    // skin exactly the bones it names, in its own joint order.
    skinned.push({
      name: mesh.name,
      geometry,
      slots,
      bones: skin.joints.map(j => bones[j] ?? bones[0]),
      inverses: skin.joints.map((_, j) => new THREE.Matrix4().fromArray(skin.inverseBind, j * 16)),
    });
  }

  // One mesh on one skeleton: a part per draw cost each body one draw, one
  // bone pass and one bone upload per part, though most parts share a material.
  const whole = skinned.length === 1 ? skinned[0]! : mergeParts(skinned);
  geometries.push(whole.geometry);
  const material = whole.slots.length === 1 ? whole.slots[0]! : whole.slots;
  const three = new THREE.SkinnedMesh(whole.geometry, material);
  three.name = whole.name;
  const skeleton = new THREE.Skeleton(whole.bones, whole.inverses);
  // The decoded mesh already has bindShape baked into its vertex positions,
  // so it arrives in model space. Passing the actual bindShape here would
  // apply it a second time in the shader, which distorts meshes whose
  // bindShape is not identity.
  // Use identity so the shader only applies the bone skinning matrices.
  three.bind(skeleton, new THREE.Matrix4());
  // Keep frustum culling on. A skinned mesh's bounds come from the bind
  // pose, which for idle-type clips stays close enough; disabling it instead
  // forced all 543 skinned meshes to draw every frame. Pad the radius so a
  // limb swinging out does not pop the whole character.
  if (whole.geometry.boundingSphere) whole.geometry.boundingSphere.radius *= 1.75;
  group.add(three);

  return { object: group, geometries, skeleton };
}

/** One skinned mesh before it is drawn: its geometry, a material per group, and its bones. */
interface SkinnedPart {
  name: string;
  geometry: THREE.BufferGeometry;
  /** Material per geometry group, by group index. */
  slots: THREE.Material[];
  bones: THREE.Bone[];
  inverses: THREE.Matrix4[];
}

/**
 * Join skinned parts into one: a shared bone list (a bone twice only when
 * two parts bind it differently), skin indices remapped onto it, and the
 * triangles regrouped so each material is one contiguous group.
 */
function mergeParts(parts: readonly SkinnedPart[]): SkinnedPart {
  const bones: THREE.Bone[] = [];
  const inverses: THREE.Matrix4[] = [];
  const jointOf = new Map<string, number>();
  const remaps = parts.map(part =>
    part.bones.map((bone, j) => {
      const inverse = part.inverses[j]!;
      const key = `${bone.uuid}:${inverse.elements.join(',')}`;
      let at = jointOf.get(key);
      if (at === undefined) {
        at = bones.length;
        jointOf.set(key, at);
        bones.push(bone);
        inverses.push(inverse);
      }
      return at;
    }),
  );

  const vertexCount = parts.reduce((n, p) => n + p.geometry.getAttribute('position').count, 0);
  const hasUv = parts.some(p => p.geometry.getAttribute('uv'));
  const position = new Float32Array(vertexCount * 3);
  const normal = new Float32Array(vertexCount * 3);
  const uv = hasUv ? new Float32Array(vertexCount * 2) : null;
  const skinIndex = new Uint16Array(vertexCount * 4);
  const skinWeight = new Float32Array(vertexCount * 4);

  const materials: THREE.Material[] = [];
  const triangles = new Map<THREE.Material, number[]>();
  let base = 0;
  parts.forEach((part, p) => {
    const g = part.geometry;
    const count = g.getAttribute('position').count;
    position.set(g.getAttribute('position').array as Float32Array, base * 3);
    normal.set(g.getAttribute('normal').array as Float32Array, base * 3);
    const partUv = g.getAttribute('uv');
    if (uv && partUv) uv.set(partUv.array as Float32Array, base * 2);
    skinWeight.set(g.getAttribute('skinWeight').array as Float32Array, base * 4);
    const indices = g.getAttribute('skinIndex').array as Uint16Array;
    const remap = remaps[p]!;
    for (let i = 0; i < count * 4; i++) skinIndex[base * 4 + i] = remap[indices[i]!] ?? remap[0]!;

    const index = g.getIndex()!.array;
    for (const group of g.groups) {
      const material = part.slots[group.materialIndex ?? 0]!;
      let into = triangles.get(material);
      if (!into) {
        into = [];
        triangles.set(material, into);
        materials.push(material);
      }
      for (let i = group.start; i < group.start + group.count; i++) into.push(index[i]! + base);
    }
    base += count;
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  if (uv) geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geometry.setAttribute('skinIndex', new THREE.BufferAttribute(skinIndex, 4));
  geometry.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeight, 4));
  const total = materials.reduce((n, m) => n + triangles.get(m)!.length, 0);
  const index = vertexCount > 0xffff ? new Uint32Array(total) : new Uint16Array(total);
  let start = 0;
  materials.forEach((material, m) => {
    const run = triangles.get(material)!;
    index.set(run, start);
    geometry.addGroup(start, run.length, m);
    start += run.length;
  });
  geometry.setIndex(new THREE.BufferAttribute(index, 1));
  geometry.computeBoundingSphere();

  return {
    name: parts.map(p => p.name).join('+'),
    geometry,
    slots: materials,
    bones,
    inverses,
  };
}

/** A worn cape mesh, by the family name the body models give their variants. */
const isCape = (name: string): boolean => /^cape_\d+/i.test(name);

/**
 * Bones a rigid cape hangs from, upper back first. Some bodies (orc, elf male,
 * undead female in the user's files) ship their longer capes with no skin, so
 * left on the group they stay put while the run and idle clips bend the spine
 * away from them. Own choice: the upper spine, the bone the skinned capes
 * weigh most on.
 */
const CAPE_BONES = ['Bip01_Spine1-node', 'Bip01_Spine-node'];

/** The bone a rigid cape follows, with its rest-pose world matrix current; null on a body with none. */
function rigidCapeBone(bones: readonly THREE.Bone[], group: THREE.Group): THREE.Bone | null {
  const bone = CAPE_BONES.map(name => bones.find(b => b.name === name)).find(Boolean) ?? null;
  if (bone) group.updateMatrixWorld(true);
  return bone;
}

function buildBones(data: SkeletonData): { bones: THREE.Bone[]; roots: THREE.Bone[] } {
  const bones = data.bones.map(b => {
    const bone = new THREE.Bone();
    bone.name = b.id;
    bone.position.set(...b.position);
    bone.quaternion.set(...b.quaternion);
    bone.scale.set(...b.scale);
    // The pose the file stands the body in, kept for a portrait to go back to.
    bone.userData.rest = {
      position: [...b.position],
      quaternion: [...b.quaternion],
      scale: [...b.scale],
    };
    return bone;
  });

  const roots: THREE.Bone[] = [];
  data.bones.forEach((b, i) => {
    if (b.parent >= 0 && bones[b.parent]) bones[b.parent].add(bones[i]);
    else roots.push(bones[i]);
  });
  return { bones, roots };
}

function buildGeometry(mesh: ModelData['meshes'][number]): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
  if (mesh.uvs.length > 0) {
    geometry.setAttribute('uv', new THREE.BufferAttribute(mesh.uvs, 2));
  }
  if (mesh.normals.length === mesh.positions.length) {
    geometry.setAttribute('normal', new THREE.BufferAttribute(mesh.normals, 3));
  }
  geometry.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
  if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/** Pad or trim to the vertex count, so a short skin cannot corrupt a draw. */
function fit<T extends Uint16Array | Float32Array>(
  src: T,
  length: number,
  ctor: new (n: number) => T,
): T {
  if (src.length === length) return src;
  const out = new ctor(length);
  out.set(src.subarray(0, Math.min(src.length, length)));
  return out;
}

/**
 * Weights must sum to 1 per vertex or the mesh shrinks toward the origin.
 * A vertex with no weight at all is pinned to its first joint.
 */
function normaliseWeights(src: Float32Array, vertexCount: number): Float32Array {
  const out = fit(src, vertexCount * 4, Float32Array);
  for (let v = 0; v < vertexCount; v++) {
    const o = v * 4;
    const sum = out[o] + out[o + 1] + out[o + 2] + out[o + 3];
    if (sum > 1e-6) {
      out[o] /= sum;
      out[o + 1] /= sum;
      out[o + 2] /= sum;
      out[o + 3] /= sum;
    } else {
      out[o] = 1;
      out[o + 1] = 0;
      out[o + 2] = 0;
      out[o + 3] = 0;
    }
  }
  return out;
}

/** To a three clip; tracks bind by bone name, and `morphInfluence` tracks address a mesh's weight by index. */
export function toThreeClip(clip: AnimationClipData): THREE.AnimationClip {
  // Some clips have keyframes that don't start at 0 (e.g. run_normal starts at
  // tick 22). Three.js loops 0..duration, so the gap before the first keyframe
  // plays as a visible pause. Fix: shift all times so they start at 0.
  let globalMin = Infinity;
  for (const track of clip.tracks) {
    for (const t of track.times) {
      if (t < globalMin) globalMin = t;
    }
  }
  if (globalMin <= 0) globalMin = 0;

  const tracks: THREE.KeyframeTrack[] = [];
  let maxTime = 0;
  for (const track of clip.tracks) {
    const path =
      track.property === 'morphInfluence'
        ? `${track.bone}.morphTargetInfluences[${track.morphIndex ?? 0}]`
        : `${track.bone}.${track.property}`;
    const shifted =
      globalMin > 0
        ? (track.times as unknown as number[]).map(t => t - globalMin)
        : (track.times as unknown as number[]);
    const last = shifted[shifted.length - 1];
    if (last > maxTime) maxTime = last;
    const values = track.values as unknown as number[];
    tracks.push(
      track.property === 'quaternion'
        ? new THREE.QuaternionKeyframeTrack(path, shifted, values)
        : track.property === 'morphInfluence'
          ? new THREE.NumberKeyframeTrack(path, shifted, values)
          : new THREE.VectorKeyframeTrack(path, shifted, values),
    );
  }
  return new THREE.AnimationClip(clip.name, maxTime, tracks);
}
