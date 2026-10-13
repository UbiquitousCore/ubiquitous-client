/**
 * A building and its `_inside.bdae`: the shell repeats inner surfaces the
 * interior draws in the same plane, which z-fight, so the shell's copies go.
 */

import type { MeshData, MeshGroup, ModelData } from '../types';

const INTERIOR_SUFFIX = '_inside.bdae';

/** The interior placed with a building model, or null for an interior itself. */
export function interiorOf(path: string): string | null {
  const lower = path.toLowerCase();
  if (!lower.endsWith('.bdae') || lower.endsWith(INTERIOR_SUFFIX)) return null;
  return `${path.slice(0, -'.bdae'.length)}${INTERIOR_SUFFIX}`;
}

/**
 * How far apart two faces may lie and still be one surface, in model units.
 * The inn's shell and interior walls sit within 0.0003 of each other; a rug
 * laid on a floor sits 0.005 or more above it, and must survive.
 */
const SURFACE_GAP = 0.002;
/** Two faces point the same way when their normals are within two degrees. */
const SAME_FACING = Math.cos((2 * Math.PI) / 180);
/** Grid cell for finding the interior faces near a point. */
const CELL = 1;

type Vec = [number, number, number];

interface Face {
  a: Vec;
  b: Vec;
  c: Vec;
  normal: Vec;
  /** Plane offset: `normal · p` for any point on the face. */
  offset: number;
}

/**
 * `shell` with every face removed that `interior` covers completely, in the
 * same plane and facing the same way. A face only partly covered stays, and
 * so does anything the interior does not repeat. Meshes placed by an animated
 * node are left alone on both sides: their positions are not in model space.
 */
export function withoutSharedFaces(shell: ModelData, interior: ModelData): ModelData {
  const index = new FaceIndex();
  for (const mesh of interior.meshes) {
    if (mesh.chain) continue;
    for (let i = 0; i + 2 < mesh.indices.length; i += 3) {
      const face = faceOf(mesh, i);
      if (face) index.add(face);
    }
  }
  if (index.empty) return shell;

  let dropped = 0;
  const meshes: MeshData[] = [];
  for (const mesh of shell.meshes) {
    if (mesh.chain) {
      meshes.push(mesh);
      continue;
    }
    const kept: number[] = [];
    const groups: MeshGroup[] = [];
    for (const group of mesh.groups) {
      const start = kept.length;
      for (let i = group.start; i + 2 < group.start + group.count; i += 3) {
        const face = faceOf(mesh, i);
        if (face && index.covers(face)) {
          dropped++;
          continue;
        }
        kept.push(mesh.indices[i]!, mesh.indices[i + 1]!, mesh.indices[i + 2]!);
      }
      if (kept.length > start) groups.push({ ...group, start, count: kept.length - start });
    }
    if (kept.length === mesh.indices.length) {
      meshes.push(mesh);
      continue;
    }
    if (kept.length === 0) continue;
    const indices =
      mesh.indices instanceof Uint16Array ? Uint16Array.from(kept) : Uint32Array.from(kept);
    meshes.push({ ...mesh, indices, groups });
  }
  // Never empty a model: a shell with nothing left would fail to load.
  if (dropped === 0 || meshes.length === 0) return shell;
  return { ...shell, meshes };
}

function faceOf(mesh: MeshData, at: number): Face | null {
  const p = mesh.positions;
  const vertex = (k: number): Vec => {
    const j = mesh.indices[at + k]! * 3;
    return [p[j]!, p[j + 1]!, p[j + 2]!];
  };
  const a = vertex(0);
  const b = vertex(1);
  const c = vertex(2);
  const n = cross(sub(b, a), sub(c, a));
  const length = Math.hypot(n[0], n[1], n[2]);
  if (length < 1e-9) return null;
  const normal: Vec = [n[0] / length, n[1] / length, n[2] / length];
  return { a, b, c, normal, offset: dot(normal, a) };
}

/** The interior's faces, bucketed by the grid cells their bounds touch. */
class FaceIndex {
  private readonly cells = new Map<string, Face[]>();

  get empty(): boolean {
    return this.cells.size === 0;
  }

  add(face: Face): void {
    const lo = [0, 1, 2].map(k =>
      Math.floor((Math.min(face.a[k]!, face.b[k]!, face.c[k]!) - SURFACE_GAP) / CELL),
    );
    const hi = [0, 1, 2].map(k =>
      Math.floor((Math.max(face.a[k]!, face.b[k]!, face.c[k]!) + SURFACE_GAP) / CELL),
    );
    for (let x = lo[0]!; x <= hi[0]!; x++)
      for (let y = lo[1]!; y <= hi[1]!; y++)
        for (let z = lo[2]!; z <= hi[2]!; z++) {
          const key = `${x},${y},${z}`;
          const list = this.cells.get(key);
          if (list) list.push(face);
          else this.cells.set(key, [face]);
        }
  }

  /**
   * True when every sample point of `face` lies on some interior face in its
   * plane. The samples are the centre and points just inside each corner and
   * each edge, which is enough for a face split differently on the two sides.
   */
  covers(face: Face): boolean {
    const centre = scale(add(add(face.a, face.b), face.c), 1 / 3);
    const inward = (p: Vec): Vec => add(p, scale(sub(centre, p), 0.02));
    const samples = [
      centre,
      inward(face.a),
      inward(face.b),
      inward(face.c),
      inward(scale(add(face.a, face.b), 0.5)),
      inward(scale(add(face.b, face.c), 0.5)),
      inward(scale(add(face.c, face.a), 0.5)),
    ];
    return samples.every(point => this.lies(point, face.normal));
  }

  private lies(point: Vec, normal: Vec): boolean {
    const key = [0, 1, 2].map(k => Math.floor(point[k]! / CELL)).join(',');
    for (const other of this.cells.get(key) ?? []) {
      if (dot(other.normal, normal) < SAME_FACING) continue;
      if (Math.abs(dot(other.normal, point) - other.offset) > SURFACE_GAP) continue;
      if (inside(other, point)) return true;
    }
    return false;
  }
}

/** Whether `point`, projected onto `face`'s plane, falls within it. */
function inside(face: Face, point: Vec): boolean {
  const v0 = sub(face.c, face.a);
  const v1 = sub(face.b, face.a);
  const v2 = sub(point, face.a);
  const d00 = dot(v0, v0);
  const d01 = dot(v0, v1);
  const d02 = dot(v0, v2);
  const d11 = dot(v1, v1);
  const d12 = dot(v1, v2);
  const det = d00 * d11 - d01 * d01;
  if (Math.abs(det) < 1e-12) return false;
  const u = (d11 * d02 - d01 * d12) / det;
  const v = (d00 * d12 - d01 * d02) / det;
  const slack = 1e-4;
  return u >= -slack && v >= -slack && u + v <= 1 + slack;
}

function sub(a: Vec, b: Vec): Vec {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function add(a: Vec, b: Vec): Vec {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}
function scale(a: Vec, s: number): Vec {
  return [a[0] * s, a[1] * s, a[2] * s];
}
function dot(a: Vec, b: Vec): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function cross(a: Vec, b: Vec): Vec {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
