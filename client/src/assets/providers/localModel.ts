/** .bdae to ModelData/SkeletonData/AnimationClipData (skeleton+anim via
 * skeletonWire.ts). */

import { ResourceNotFoundError } from '../../core/errors';
import type {
  AnimationClipData,
  CollisionData,
  CollisionGeom,
  CollisionItem,
  MeshData,
  MeshGroup,
  ModelData,
  SkeletonData,
} from '../types';
import { Bdae, selectVariants, type BdaeMaterial, type BdaeMesh } from '../formats/bdae';
import { avatarTexture } from '../formats/avatar';
import { parsePhy } from '../formats/phy';
import type { Library } from '../vfs/Library';
import { unwrapBdae } from '../vfs/zip';
import { toAnimationClip, toNodeAnimation, toSkeleton } from './skeletonWire';
import type { MorphBindings, WireClip, WireSkeleton } from './skeletonWire';
import { NO_MATERIAL, isLightShaft, isPhyAlphaProxy, toSurface } from './surface';

/** Models live only in these packs; searching all would extract the whole build for one missing model. */
const MODEL_PACKS = ['res.bin', 'res_t.bin'];

/** Read and unwrap a .bdae. */
export async function readBdae(lib: Library, path: string): Promise<Bdae> {
  const bytes = await lib.readFirst(MODEL_PACKS, path);
  if (!bytes) throw new ResourceNotFoundError(`model:${path}`, `no such model: ${path}`);
  const { payload } = await unwrapBdae(bytes);
  return new Bdae(payload);
}

/** One model ready to draw; `defaultMeshes` stops characters wearing every outfit at once. */
export function toModelData(
  doc: Bdae,
  path: string,
  resolves: (ref: string) => boolean,
): ModelData {
  const materials = doc.materialsByName();
  const raw = doc.meshes(true);
  const meshes: MeshData[] = [];

  for (const m of raw) {
    const mesh = toMeshData(m, materials, path, resolves);
    if (mesh) meshes.push(mesh);
  }
  if (meshes.length === 0) {
    throw new ResourceNotFoundError(`model:${path}`, `model has no drawable geometry: ${path}`);
  }

  // Character models ship every appearance option as a separate mesh. For
  // /npc/ paths, and nothing else, this keeps the lowest-numbered option in
  // each slot.
  // Scenery gets an empty list, which the renderer reads as "draw all".
  const defaultMeshes = path.toLowerCase().includes('/npc/')
    ? selectVariants(raw, 0).map(m => m.name)
    : [];

  // Node animation kept only where it can bind (dropped when no chain names
  // the target bones — a silent no-op mixer still costs per-frame updates).
  const placed = new Set<string>();
  for (const mesh of meshes) for (const node of mesh.chain ?? []) placed.add(node.key);

  // A morph-weight channel names a controller, which is nowhere in the scene
  // graph; this is the only place that knows both it and the mesh it drives.
  // Bound against the meshes actually emitted, so a controller whose blend
  // shapes were dropped (a target with the wrong vertex count, say) takes its
  // curves with it rather than leaving a track pointed at nothing.
  const morphs: MorphBindings = new Map();
  const byName = new Map(meshes.map(m => [m.name, m]));
  for (const morpher of doc.morphers()) {
    const mesh = byName.get(morpher.source);
    const targets = mesh?.morphTargets?.length ?? 0;
    if (mesh && targets > 0) morphs.set(morpher.name, { mesh: mesh.name, targets });
  }

  const clip = toNodeAnimation(doc.animations(), path, morphs);
  const bound = clip
    ? clip.tracks.filter(t => t.property === 'morphInfluence' || placed.has(t.bone))
    : [];
  const nodeClip = clip && bound.length > 0 ? { ...clip, tracks: bound } : undefined;

  return { path, meshes, defaultMeshes, nodeClip };
}

/** Null with nothing drawable; groups naming undefined materials (editor leftovers) are dropped. */
function toMeshData(
  m: BdaeMesh,
  materials: Map<string, BdaeMaterial>,
  path: string,
  resolves: (ref: string) => boolean,
): MeshData | null {
  if (!m.positions || !m.indices || m.indices.length === 0) return null;

  const groups: MeshGroup[] = m.groups
    .filter(g => !g.noMaterial)
    .filter(g => !isPhyAlphaProxy(g.texture ?? ''))
    .map(g => {
      // A texture the library cannot resolve is not a texture. From 1.1.4 on
      // the avatar models ship with their images stripped, so a character
      // material with nothing bound falls back to the name 1.0.2 used.
      let texture = g.texture && resolves(g.texture) ? g.texture : null;
      if (!texture) texture = avatarTexture(path, g.material, resolves);
      const surface = toSurface(materials.get(g.material) ?? NO_MATERIAL);
      if (surface.blend === 'blend' && isLightShaft(m.name, g.texture)) {
        surface.blend = 'additive';
      }
      return {
        start: g.start,
        count: g.count,
        texture,
        material: g.material,
        ...surface,
      };
    });

  // Only invent a group when the model shipped none at all. If every group was
  // dropped for naming a missing material, the mesh is genuinely undrawable
  // and must not be resurrected by a fallback.
  if (groups.length === 0) {
    if (m.groups.length > 0) return null;
    groups.push({
      start: 0,
      count: m.indices.length,
      texture: null,
      material: '',
      blend: 'opaque',
      doubleSided: false,
      unlit: true,
      shader: '',
    });
  }

  return {
    name: m.name,
    positions: m.positions,
    normals: m.normals ?? new Float32Array(0),
    uvs: m.uvs ?? new Float32Array(0),
    colors: m.colors ?? new Uint8Array(0),
    indices: m.indices,
    groups,
    chain: m.chain,
    morphTargets: m.morph?.targets.map(t => ({
      name: t.name,
      positions: t.positions,
      normals: t.normals ?? new Float32Array(0),
      weight: t.weight,
    })),
  };
}

/** A model's bone hierarchy and per-mesh skin binding. */
export function toSkeletonData(doc: Bdae, path: string): SkeletonData {
  const wire: WireSkeleton = {
    roots: doc.nodeHierarchy(),
    skins: doc.allSkins(),
  };
  return toSkeleton(path, wire);
}

/** One animation resolved against the model's bind pose (partial curves and axis-angle turns need it). */
export function toAnimationData(
  clips: WireClip[],
  skeleton: SkeletonData,
  path: string,
): AnimationClipData {
  const name =
    path
      .split('/')
      .pop()
      ?.replace(/\.bdae$/i, '') ?? path;
  return toAnimationClip(name, clips, skeleton);
}

/** Every `.phy` geometry block as a `CollisionGeom`, parsed once per path. */
export function collisionGeoms(bytes: Uint8Array): CollisionGeom[] {
  return parsePhy(bytes).map(g => ({
    type: g.type,
    flags: g.flags,
    shape: g.shape,
    position: g.position,
    halfSize: g.halfSize,
    rotY: g.rotY,
    vertices: g.vertices,
    faces: g.faces,
  }));
}

/** Every `.phy` geometry block for one placed object. */
export function toCollisionItem(
  path: string,
  bytes: Uint8Array,
  pos: [number, number, number],
  rot: [number, number, number, number],
  scale: [number, number, number],
): CollisionItem {
  return { path, pos, rot, scale, geoms: collisionGeoms(bytes) };
}

/** .phy packs, best first: the pack holding them differs between builds, and
 * the paths inside do not. */
export const PHY_PACKS = ['model_phy.bin', 'tables.bin', 'res.bin'] as const;

export type { CollisionData };
