/** A character's skin sheet layout from its meshes: a part's region is the UV bounds of what its bones move. */

import { type Bdae, type BdaeNode, meshSlot } from './bdae';

/** Materials whose geometry samples the composited sheet. */
export const SHEET_MATERIALS = new Set(['body', 'skirt']);

/** A stretch of the figure that a piece of clothing covers. */
export type Segment =
  | 'head'
  | 'torso'
  | 'forearm'
  | 'hand'
  | 'thigh'
  | 'shin'
  | 'foot'
  /** A long garment's own mesh: thigh to ankle in one piece. */
  | 'skirt';

/** A box on the sheet in UV units: 0..1 across, 0..1 down. */
export interface SheetBox {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

export type Footprints = Partial<Record<Segment, SheetBox>>;

/** `[x0, y0, x1, y1]` in sheet pixels, end-exclusive. */
export type Rect = [number, number, number, number];

/** The parts of one mesh the footprint reader needs. */
export interface SheetMesh {
  /** `u, v` per vertex. */
  uvs: ArrayLike<number>;
  indices: ArrayLike<number>;
  /** Index ranges drawn with the sheet; the rest of the mesh is ignored. */
  ranges: Array<{ start: number; count: number }>;
  /** Bone names, indexed by `influences[].indices`. */
  bones: string[];
  /** Bone weights per vertex. */
  influences: Array<{ indices: number[]; weights: number[] }>;
  /** Set when the whole mesh is one segment, whatever its bones say. */
  segment?: Segment;
}

/** A bone's segment from its biped-style name; unrecognised bones go under the chest piece. */
export function segmentOfBone(name: string): Segment {
  const n = name.toLowerCase();
  if (n.includes('forearm')) return 'forearm';
  if (n.includes('hand') || n.includes('finger')) return 'hand';
  if (n.includes('head')) return 'head';
  if (n.includes('thigh')) return 'thigh';
  if (n.includes('calf')) return 'shin';
  if (n.includes('foot') || n.includes('toe')) return 'foot';
  return 'torso';
}

/** Patches under this share of a segment's largest are ignored: stray far-weighted slivers would stretch regions. */
const SLIVER_SHARE = 0.1;

interface Patch {
  segment: Segment;
  area: number;
  box: SheetBox;
}

/** Split a mesh's sheet triangles into connected UV patches. */
function patchesOf(mesh: SheetMesh): Patch[] {
  const parent = new Map<number, number>();
  const root = (v: number): number => {
    let r = v;
    while (parent.get(r) !== r) r = parent.get(r)!;
    // Flatten the chain walked so the next lookup is one step.
    for (let c = v; c !== r; ) {
      const next = parent.get(c)!;
      parent.set(c, r);
      c = next;
    }
    return r;
  };
  const touch = (v: number): void => {
    if (!parent.has(v)) parent.set(v, v);
  };
  const triangles: number[] = [];
  for (const { start, count } of mesh.ranges) {
    for (let i = start; i + 2 < start + count; i += 3) {
      const a = mesh.indices[i];
      const b = mesh.indices[i + 1];
      const c = mesh.indices[i + 2];
      touch(a);
      touch(b);
      touch(c);
      parent.set(root(b), root(a));
      parent.set(root(c), root(a));
      triangles.push(a, b, c);
    }
  }

  const groups = new Map<number, { area: number; verts: Set<number> }>();
  const uv = mesh.uvs;
  for (let t = 0; t < triangles.length; t += 3) {
    const [a, b, c] = [triangles[t], triangles[t + 1], triangles[t + 2]];
    const key = root(a);
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { area: 0, verts: new Set() }));
    g.verts.add(a).add(b).add(c);
    const abu = uv[b * 2] - uv[a * 2];
    const abv = uv[b * 2 + 1] - uv[a * 2 + 1];
    const acu = uv[c * 2] - uv[a * 2];
    const acv = uv[c * 2 + 1] - uv[a * 2 + 1];
    g.area += Math.abs(abu * acv - acu * abv) / 2;
  }

  const out: Patch[] = [];
  for (const { area, verts } of groups.values()) {
    const weight = new Map<Segment, number>();
    const box: SheetBox = { u0: Infinity, v0: Infinity, u1: -Infinity, v1: -Infinity };
    for (const v of verts) {
      box.u0 = Math.min(box.u0, uv[v * 2]);
      box.u1 = Math.max(box.u1, uv[v * 2]);
      box.v0 = Math.min(box.v0, uv[v * 2 + 1]);
      box.v1 = Math.max(box.v1, uv[v * 2 + 1]);
      const inf = mesh.influences[v];
      if (!inf) continue;
      inf.indices.forEach((bone, k) => {
        const seg = segmentOfBone(mesh.bones[bone] ?? '');
        weight.set(seg, (weight.get(seg) ?? 0) + (inf.weights[k] ?? 0));
      });
    }
    let segment: Segment = mesh.segment ?? 'torso';
    let best = mesh.segment ? Infinity : -1;
    for (const [seg, w] of weight) {
      if (w > best) {
        best = w;
        segment = seg;
      }
    }
    out.push({ segment, area, box });
  }
  return out;
}

/** Where each segment's patches lie on the sheet. */
export function footprints(meshes: SheetMesh[]): Footprints {
  const bySegment = new Map<Segment, Patch[]>();
  for (const mesh of meshes) {
    for (const p of patchesOf(mesh)) {
      const list = bySegment.get(p.segment) ?? [];
      list.push(p);
      bySegment.set(p.segment, list);
    }
  }
  const out: Footprints = {};
  for (const [segment, list] of bySegment) {
    const largest = Math.max(...list.map(p => p.area));
    const kept = list.filter(p => p.area >= largest * SLIVER_SHARE);
    out[segment] = union(kept.map(p => p.box));
  }
  return out;
}

function union(boxes: SheetBox[]): SheetBox {
  return {
    u0: Math.min(...boxes.map(b => b.u0)),
    v0: Math.min(...boxes.map(b => b.v0)),
    u1: Math.max(...boxes.map(b => b.u1)),
    v1: Math.max(...boxes.map(b => b.v1)),
  };
}

/**
 * How far past the sheet's centre line a footprint may reach and still count
 * as sitting in one half. Every part of a character sheet is laid out in the
 * left half, the right half, or across both.
 */
const HALF_SLACK = 1 / 16;

/** An edge this close to the sheet's border, as a share of it, is on it. */
const BORDER_SNAP = 1 / 64;

/**
 * Lower-body art starts above the leg meshes by this share of their height,
 * so that a waistband painted near the top of the art sits on the hips. Chosen
 * by eye against the shipped trouser art.
 */
const HIP_SHARE = 1 / 6;

/** A part's pixel rect: across, the half its footprints use; down, their bounds snapped to the border nearby; `hips` lifts lower-body art. */
export function regionRect(
  boxes: Array<SheetBox | undefined>,
  width: number,
  height: number,
  hips = false,
): Rect | null {
  const known = boxes.filter((b): b is SheetBox => b !== undefined);
  if (known.length === 0) return null;
  const box = union(known);

  const left = box.u0 < 0.5 - HALF_SLACK;
  const right = box.u1 > 0.5 + HALF_SLACK;
  const half = Math.round(width / 2);
  // A footprint that fits inside the slack on both sides of the centre
  // line keeps whichever half holds its middle.
  const leftHalf = left || (!right && box.u0 + box.u1 < 1);
  const x0 = leftHalf ? 0 : half;
  const x1 = right || !leftHalf ? width : half;

  let y0 = Math.round(box.v0 * height);
  let y1 = Math.round(box.v1 * height);
  if (y0 <= height * BORDER_SNAP) y0 = 0;
  if (y1 >= height * (1 - BORDER_SNAP)) y1 = height;
  if (hips) y0 = Math.max(0, y0 - Math.round((y1 - y0) * HIP_SHARE));
  return [x0, y0, x1, y1];
}

/** Each limb mesh's segment by name family: its weights span pelvis and legs, so bones would misplace it. */
const FAMILY_SEGMENT: Record<string, Segment> = {
  hair: 'head',
  lowerarm: 'forearm',
  upperleg: 'thigh',
  lowerleg: 'shin',
  skirt: 'skirt',
  special: 'skirt',
};

/** The mesh family split by its bones rather than by its name. */
const BODY_FAMILY = 'body';

/** The sheet meshes of a character model, with bone names resolved. */
export function sheetMeshes(doc: Bdae): SheetMesh[] {
  // Skins name their joints by scoped id; the hierarchy maps those to names.
  const names = new Map<string, string>();
  const walk = (n: BdaeNode): void => {
    if (n.sid) names.set(n.sid, n.name);
    names.set(n.id, n.name);
    n.children.forEach(walk);
  };
  doc.nodeHierarchy().forEach(walk);

  const skins = new Map(Object.values(doc.allSkins()).map(s => [s.source.replace(/^#/, ''), s]));
  const out: SheetMesh[] = [];
  for (const mesh of doc.meshes(true)) {
    const ranges = mesh.groups.filter(g => SHEET_MATERIALS.has(g.material));
    if (ranges.length === 0 || !mesh.uvs || !mesh.indices) continue;
    const [family, variant] = meshSlot(mesh.name);
    const segment = FAMILY_SEGMENT[family];
    const skin = skins.get(mesh.name);
    const weighted = skin !== undefined && skin.weights.length >= mesh.vertexCount;
    // Split by bones: the body, and a mesh with no variant number, which is a
    // figure modelled in one piece. Other families — capes, ears — carry art
    // of their own laid over the sheet and say nothing about its layout.
    if (!segment && family !== BODY_FAMILY && variant !== 0) continue;
    if (!segment && !weighted) continue;
    out.push({
      uvs: mesh.uvs,
      indices: mesh.indices,
      ranges: ranges.map(g => ({ start: g.start, count: g.count })),
      bones: weighted ? skin.jointNames.map(j => names.get(j) ?? j) : [],
      influences: weighted ? skin.weights : [],
      segment,
    });
  }
  return out;
}

/** The parts of a mesh the bare-scalp test reads. */
export interface NamedMesh {
  name: string;
  groups: ReadonlyArray<{ material: string; count: number }>;
}

/** Fewer indices than this outside the sheet is no hair: under two triangles. */
const HAIR_INDICES = 6;

/**
 * The hair styles whose mesh is bare scalp: the mesh draws the skin sheet
 * and next to nothing of its own hair material. Painted hair under one of
 * these would give a shaved head a hairline.
 */
export function bareScalpStyles(meshes: readonly NamedMesh[]): Set<number> {
  const bare = new Set<number>();
  for (const mesh of meshes) {
    const [family, style] = meshSlot(mesh.name);
    if (family !== 'hair') continue;
    const ownHair = mesh.groups
      .filter(g => !SHEET_MATERIALS.has(g.material))
      .reduce((sum, g) => sum + g.count, 0);
    if (ownHair < HAIR_INDICES) bare.add(style);
  }
  return bare;
}
