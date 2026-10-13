/**
 * CollisionWorld — zone solid geometry as world-space triangles in a flat XZ
 * grid. Answers `groundAt` and `wallsNear`. No Three.js, no GPU, pure math.
 */

import type { CollisionData, CollisionGeom, CollisionItem } from '../assets/types';
import { logger } from '../core/log';
import { gridKey } from './gridKey';

const log = logger('collision');

/** World units per grid cell. Roughly one player stride. */
const CELL_SIZE = 4;

/** Reject geometry with extents larger than this; it is degenerate, not a mesh. */
const MAX_HALF_SIZE = 200;

/** Thinnest primitive half-size: zone 471 has 162 zero-thickness walls, kept by padding. */
const MIN_HALF_SIZE = 0.05;

/** Step height: walk-up-onto vs walk-into must agree (0.6 clears the steepest
 * walkable slope with margin, leaves zone-471 furniture solid). */
export const STEP_UP = 0.6;

/** Walkable when the normal's Y is at least 0.5; higher drops walkers through arched bridges. */
export const WALKABLE_NORMAL_Y = 0.5;

/** Walls are the same 0.5 boundary from the other side; no gap between floor and wall. */
const WALL_NORMAL_Y = 0.5;

export type Vec3 = [number, number, number];

export type SurfaceKind = 'floor' | 'wall' | 'other';

/** One world-space collision triangle. */
export interface CollisionTri {
  /** Vertices, world space, in winding order. */
  v: [Vec3, Vec3, Vec3];
  /** Unit normal, world space, always pointing up. */
  n: Vec3;
  minY: number;
  maxY: number;
  kind: SurfaceKind;
  /** Source `.phy` path, for debugging. */
  path: string;
  /** Whether the surface is wood: a deck, a bridge, a floorboard. */
  wood: boolean;
}

/** What `groundAt` found: a height and where it came from. */
export interface GroundHit {
  y: number;
  /** Unit normal of the triangle underfoot. */
  normal: Vec3;
  path: string;
  /** Whether the surface underfoot is wood. */
  wood: boolean;
}

/** What a batch of collision is filed under, so it can be dropped again. */
export type CollisionGroup = string;

/** The group `load()` files everything under: one un-streamed lump. */
const WHOLE = '*';
/** Own choice: blocks with flag bit 0 or 1 are walked into, not against (`client/docs/formats/phy.md`). */
const TRIGGER_AREA_BITS = 0x3;
/** Wood surface; in 2.2.0 the 99 `.phy` files with it are bridges, docks, inns, boats and the like, no stone. */
const WOOD_BIT = 0x400;

function isWood(geom: CollisionGeom): boolean {
  return ((geom.flags ?? 0) & WOOD_BIT) !== 0;
}

/** A ground-plane box a wall is allowed to stand in without blocking. */
export interface OpenArea {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Solid geometry grouped by tile (streams/evicts with the ground;
 * triangle refs survive eviction where indices would not). */
export class CollisionWorld {
  /** Spatial index: `gridKey(cx, cz)` -> the triangles overlapping that cell. */
  private readonly cells = new Map<number, CollisionTri[]>();
  /** Reused by every query: walls are asked for several times a frame. */
  private readonly wallScratch: CollisionTri[] = [];
  private readonly seenScratch = new Set<CollisionTri>();
  /** Group key -> the triangles it contributed, for eviction. */
  private readonly groups = new Map<CollisionGroup, CollisionTri[]>();
  /**
   * Boxes where walls stop blocking, by the server's name. Filtered at query
   * time, so streamed-in geometry is passable too. Floors are never filtered.
   */
  private readonly openAreas = new Map<string, OpenArea>();
  private triangles = 0;

  /** Let walls inside `area` stop blocking. Re-opening the same name replaces it. */
  openArea(name: string, area: OpenArea): void {
    this.openAreas.set(name, area);
    log.debug(`open area ${name}: x ${area.minX}..${area.maxX}, z ${area.minZ}..${area.maxZ}`);
  }

  /** Forget every open area — a map change starts over. */
  closeAllAreas(): void {
    this.openAreas.clear();
  }

  /**
   * Overlap on the ground plane, not a vertex inside: one triangle can span a
   * whole wall across the opening. A box drawn too large takes neighbouring
   * wall with it; sizing it is the server's job.
   */
  private isOpened(t: CollisionTri): boolean {
    if (this.openAreas.size === 0) return false;
    const minX = Math.min(t.v[0][0], t.v[1][0], t.v[2][0]);
    const maxX = Math.max(t.v[0][0], t.v[1][0], t.v[2][0]);
    const minZ = Math.min(t.v[0][2], t.v[1][2], t.v[2][2]);
    const maxZ = Math.max(t.v[0][2], t.v[1][2], t.v[2][2]);
    for (const a of this.openAreas.values()) {
      if (maxX < a.minX || minX > a.maxX) continue;
      if (maxZ < a.minZ || minZ > a.maxZ) continue;
      return true;
    }
    return false;
  }

  /** Replace everything with one un-streamed batch. For tests and tools. */
  load(data: CollisionData): void {
    this.clear();
    this.addGroup(WHOLE, data.items);
  }

  /** File collision under `group`, replacing it, so a tile arriving twice cannot double. */
  addGroup(group: CollisionGroup, items: readonly CollisionItem[]): void {
    this.removeGroup(group);
    const tris: CollisionTri[] = [];
    let meshes = 0;
    let prims = 0;
    let skipped = 0;

    for (const item of items) {
      for (const geom of item.geoms) {
        if ((geom.flags ?? 0) & TRIGGER_AREA_BITS) {
          skipped++;
          continue;
        }
        const before = tris.length;
        if (geom.type === 'mesh') this.addMesh(tris, item, geom);
        else this.addPrimitive(tris, item, geom);
        if (tris.length === before) skipped++;
        else if (geom.type === 'mesh') meshes++;
        else prims++;
      }
    }

    for (const t of tris) this.index(t);
    this.groups.set(group, tris);
    this.triangles += tris.length;

    log.debug(
      `collision ${group}: ${items.length} items, ${meshes} meshes, ` +
        `${prims} primitives, ${skipped} skipped, ${tris.length} triangles`,
    );
  }

  /** Drop a group's geometry. Unknown groups are a no-op. */
  removeGroup(group: CollisionGroup): void {
    const tris = this.groups.get(group);
    if (!tris) return;
    this.groups.delete(group);
    this.triangles -= tris.length;
    if (tris.length === 0) return;

    // Filter each touched cell once: per-triangle filtering was O(k²) per cell
    // and hitched every 64 units walked.
    const doomed = new Set(tris);
    const touched = new Set<number>();
    for (const t of tris) {
      for (const key of cellsOf(t)) touched.add(key);
    }
    for (const key of touched) {
      const bucket = this.cells.get(key);
      if (!bucket) continue;
      const kept = bucket.filter(x => !doomed.has(x));
      if (kept.length === 0) this.cells.delete(key);
      else if (kept.length !== bucket.length) this.cells.set(key, kept);
    }
  }

  /**
   * Drop triangles inside `area` from `paths`: together they name one door.
   * Removed rather than filtered, since its surfaces are read by code that
   * never asks about doors. Later geometry is filtered at tile assembly.
   */
  removeMatching(area: OpenArea, paths: readonly string[]): number {
    if (paths.length === 0) return 0;
    const doomed = new Set<CollisionTri>();
    for (const [group, tris] of this.groups) {
      const kept = tris.filter(t => {
        if (!paths.some(name => t.path.includes(name))) return true;
        const minX = Math.min(t.v[0][0], t.v[1][0], t.v[2][0]);
        const maxX = Math.max(t.v[0][0], t.v[1][0], t.v[2][0]);
        const minZ = Math.min(t.v[0][2], t.v[1][2], t.v[2][2]);
        const maxZ = Math.max(t.v[0][2], t.v[1][2], t.v[2][2]);
        if (maxX < area.minX || minX > area.maxX) return true;
        if (maxZ < area.minZ || minZ > area.maxZ) return true;
        doomed.add(t);
        return false;
      });
      if (kept.length !== tris.length) this.groups.set(group, kept);
    }
    if (doomed.size === 0) return 0;

    const touched = new Set<number>();
    for (const t of doomed) {
      for (const key of cellsOf(t)) touched.add(key);
    }
    for (const key of touched) {
      const bucket = this.cells.get(key);
      if (!bucket) continue;
      const kept = bucket.filter(x => !doomed.has(x));
      if (kept.length === 0) this.cells.delete(key);
      else if (kept.length !== bucket.length) this.cells.set(key, kept);
    }
    this.triangles -= doomed.size;
    log.debug(`removed ${doomed.size} triangle(s) of ${paths.join(', ')}`);
    return doomed.size;
  }

  /**
   * Drop every triangle. Open areas survive: the zone load replacing the
   * geometry runs after the message that opened them. `closeAllAreas`
   * forgets them on a map change.
   */
  clear(): void {
    this.cells.clear();
    this.groups.clear();
    this.triangles = 0;
  }

  /** Every open area, for the debug view. */
  openAreaList(): Array<{ name: string } & OpenArea> {
    return [...this.openAreas.entries()].map(([name, a]) => ({ name, ...a }));
  }

  /** Anything to collide with yet; true from the first resident tile. */
  isLoaded(): boolean {
    return this.triangles > 0;
  }

  triangleCount(): number {
    return this.triangles;
  }

  cellCount(): number {
    return this.cells.size;
  }

  /** Highest walkable surface within `stepUp` above `fromY`, or null for the terrain fallback. */
  groundAt(x: number, z: number, fromY: number, stepUp = STEP_UP): GroundHit | null {
    const ceiling = fromY + stepUp;
    let best: GroundHit | null = null;
    for (const t of this.candidates(x, z)) {
      if (t.minY > ceiling) continue;
      if (best !== null && t.maxY < best.y) continue;
      const y = heightAt(t, x, z);
      if (y === null || y > ceiling) continue;
      if (best === null || y > best.y) best = { y, normal: t.n, path: t.path, wood: t.wood };
    }
    return best;
  }

  /**
   * Wall triangles within `radius` spanning the band [minY, maxY]: above a
   * step, below the head. The list is reused, and good until the next call.
   */
  wallsNear(
    x: number,
    z: number,
    minY: number,
    maxY: number,
    radius: number,
  ): readonly CollisionTri[] {
    const lo = minY;
    const hi = maxY;
    const out = this.wallScratch;
    out.length = 0;
    const seen = this.seenScratch;
    seen.clear();
    const cx0 = Math.floor((x - radius) / CELL_SIZE);
    const cx1 = Math.floor((x + radius) / CELL_SIZE);
    const cz0 = Math.floor((z - radius) / CELL_SIZE);
    const cz1 = Math.floor((z + radius) / CELL_SIZE);
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cz = cz0; cz <= cz1; cz++) {
        const bucket = this.cells.get(gridKey(cx, cz));
        if (!bucket) continue;
        for (const t of bucket) {
          if (seen.has(t)) continue;
          seen.add(t);
          if (t.kind !== 'wall') continue;
          if (t.maxY <= lo || t.minY >= hi) continue;
          if (this.isOpened(t)) continue;
          out.push(t);
        }
      }
    }
    return out;
  }

  /** Nearest solid hit along a->b, or null (camera question; every triangle
   * and both faces count). */
  segmentHit(a: Vec3, b: Vec3): { distance: number; path: string } | null {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const dz = b[2] - a[2];
    const length = Math.hypot(dx, dy, dz);
    if (length < 1e-6) return null;

    let best: { distance: number; path: string } | null = null;
    const seen = this.seenScratch;
    seen.clear();
    // The segment's bounding cells: a camera boom touches a handful, and the
    // box cannot miss a diagonally clipped cell.
    const cx0 = Math.floor(Math.min(a[0], b[0]) / CELL_SIZE);
    const cx1 = Math.floor(Math.max(a[0], b[0]) / CELL_SIZE);
    const cz0 = Math.floor(Math.min(a[2], b[2]) / CELL_SIZE);
    const cz1 = Math.floor(Math.max(a[2], b[2]) / CELL_SIZE);
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cz = cz0; cz <= cz1; cz++) {
        const bucket = this.cells.get(gridKey(cx, cz));
        if (!bucket) continue;
        for (const t of bucket) {
          if (seen.has(t)) continue;
          seen.add(t);
          if (t.kind === 'wall' && this.isOpened(t)) continue;
          const hit = segmentTriangle(a, dx, dy, dz, t);
          if (hit === null) continue;
          const distance = hit * length;
          if (best === null || distance < best.distance) {
            best = { distance, path: t.path };
          }
        }
      }
    }
    return best;
  }

  /** Debug-view triangles as plain arrays; `renderer/` builds the geometry. */
  debugTriangles(): { positions: Float32Array; kinds: SurfaceKind[] } {
    const positions = new Float32Array(this.triangles * 9);
    const kinds: SurfaceKind[] = new Array(this.triangles);
    let o = 0;
    let i = 0;
    for (const tris of this.groups.values()) {
      for (const t of tris) {
        for (const p of t.v) {
          positions[o++] = p[0];
          positions[o++] = p[1];
          positions[o++] = p[2];
        }
        kinds[i++] = t.kind;
      }
    }
    return { positions, kinds };
  }

  /** Debug: every triangle whose footprint covers (x, z), highest first. */
  probe(
    x: number,
    z: number,
  ): Array<{ y: number; kind: SurfaceKind; normalY: number; path: string }> {
    const out: Array<{ y: number; kind: SurfaceKind; normalY: number; path: string }> = [];
    for (const t of this.candidates(x, z)) {
      const y = heightAt(t, x, z);
      if (y === null) continue;
      out.push({ y, kind: t.kind, normalY: t.n[1], path: t.path });
    }
    return out.sort((a, b) => b.y - a.y);
  }

  // — building --------------------------------------------------------

  /** Triangles in the cell containing (x, z). */
  private candidates(x: number, z: number): readonly CollisionTri[] {
    return this.cells.get(gridKey(Math.floor(x / CELL_SIZE), Math.floor(z / CELL_SIZE))) ?? EMPTY;
  }

  private addMesh(out: CollisionTri[], item: CollisionItem, geom: CollisionGeom): void {
    const verts = geom.vertices;
    const faces = geom.faces;
    if (!verts?.length || !faces?.length) return;
    const hs = geom.halfSize;
    if (
      hs &&
      (Math.abs(hs[0]) > MAX_HALF_SIZE ||
        Math.abs(hs[1]) > MAX_HALF_SIZE ||
        Math.abs(hs[2]) > MAX_HALF_SIZE)
    ) {
      return;
    }

    // Vertices are shared between faces, so transform each one once.
    const world: Vec3[] = verts.map(v =>
      transform(
        [v[0] + geom.position[0], v[1] + geom.position[1], v[2] + geom.position[2]],
        item.pos,
        item.rot,
        item.scale,
      ),
    );

    for (const face of faces) {
      const [a, b, c] = face;
      if (a >= world.length || b >= world.length || c >= world.length) continue;
      push(out, world[a], world[b], world[c], item.path, isWood(geom));
    }
  }

  /**
   * Cylinders become 12-sided prisms: as boxes they over-block 41% at the
   * corners (201 in zone 471). Everything else is its oriented box, crude
   * for a sphere but better than nothing.
   */
  private addPrimitive(out: CollisionTri[], item: CollisionItem, geom: CollisionGeom): void {
    const raw = geom.halfSize;
    if (!raw) return;
    if (
      Math.abs(raw[0]) > MAX_HALF_SIZE ||
      Math.abs(raw[1]) > MAX_HALF_SIZE ||
      Math.abs(raw[2]) > MAX_HALF_SIZE
    ) {
      return;
    }
    // A block that is flat in one axis is a panel, not a mistake; only one
    // with no extent at all is nothing.
    if (raw[0] <= 0 && raw[1] <= 0 && raw[2] <= 0) return;
    const half = raw.map(v => Math.max(v, MIN_HALF_SIZE));

    // The block carries its own yaw about the Y axis, applied before
    // the placement's transform.
    const yaw = geom.rotY ?? 0;
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);

    // Corner index = xBit*4 + yBit*2 + zBit, bit 0 = the negative side.
    const corners: Vec3[] = [];
    for (const sx of [-1, 1]) {
      for (const sv of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const lx = sx * half[0];
          const ly = sv * half[1];
          const lz = sz * half[2];
          corners.push(
            transform(
              [
                lx * cy + lz * sy + geom.position[0],
                ly + geom.position[1],
                -lx * sy + lz * cy + geom.position[2],
              ],
              item.pos,
              item.rot,
              item.scale,
            ),
          );
        }
      }
    }

    if (geom.shape === 'cylinder') {
      this.addPrism(out, item, geom, half, yaw);
      return;
    }

    const q = (x: number, y: number, z: number) => corners[x * 4 + y * 2 + z];
    const quad = (p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3) => {
      push(out, p0, p1, p2, item.path, isWood(geom));
      push(out, p0, p2, p3, item.path, isWood(geom));
    };
    quad(q(0, 1, 0), q(0, 1, 1), q(1, 1, 1), q(1, 1, 0)); // top
    quad(q(0, 0, 0), q(1, 0, 0), q(1, 0, 1), q(0, 0, 1)); // bottom
    quad(q(0, 0, 0), q(0, 0, 1), q(0, 1, 1), q(0, 1, 0)); // -x
    quad(q(1, 0, 1), q(1, 0, 0), q(1, 1, 0), q(1, 1, 1)); // +x
    quad(q(1, 0, 0), q(0, 0, 0), q(0, 1, 0), q(1, 1, 0)); // -z
    quad(q(0, 0, 1), q(1, 0, 1), q(1, 1, 1), q(0, 1, 1)); // +z
  }

  /**
   * A cylinder, as a 12-sided prism. `half` gives the two horizontal
   * semi-axes and the height, so a squashed cylinder stays squashed.
   */
  private addPrism(
    out: CollisionTri[],
    item: CollisionItem,
    geom: CollisionGeom,
    half: number[],
    yaw: number,
  ): void {
    const SIDES = 12;
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    const place = (lx: number, ly: number, lz: number): Vec3 =>
      transform(
        [
          lx * cy + lz * sy + geom.position[0],
          ly + geom.position[1],
          -lx * sy + lz * cy + geom.position[2],
        ],
        item.pos,
        item.rot,
        item.scale,
      );

    const top: Vec3[] = [];
    const bottom: Vec3[] = [];
    for (let i = 0; i < SIDES; i++) {
      const a = (i / SIDES) * Math.PI * 2;
      const px = Math.cos(a) * half[0];
      const pz = Math.sin(a) * half[2];
      top.push(place(px, half[1], pz));
      bottom.push(place(px, -half[1], pz));
    }

    for (let i = 0; i < SIDES; i++) {
      const j = (i + 1) % SIDES;
      // Side wall.
      push(out, bottom[i], bottom[j], top[j], item.path, isWood(geom));
      push(out, bottom[i], top[j], top[i], item.path, isWood(geom));
      // Caps, as a fan from vertex 0.
      if (i > 0 && j !== 0) {
        push(out, top[0], top[i], top[j], item.path, isWood(geom));
        push(out, bottom[0], bottom[j], bottom[i], item.path, isWood(geom));
      }
    }
  }

  /** Bucket a triangle into every cell its XZ bounding box touches. */
  private index(t: CollisionTri): void {
    for (const key of cellsOf(t)) {
      const bucket = this.cells.get(key);
      if (bucket) bucket.push(t);
      else this.cells.set(key, [t]);
    }
  }
}

const EMPTY: readonly CollisionTri[] = [];

/** Classify a world-space triangle and keep it, unless it is degenerate. */
function push(out: CollisionTri[], a: Vec3, b: Vec3, c: Vec3, path: string, wood: boolean): void {
  const ux = b[0] - a[0],
    uy = b[1] - a[1],
    uz = b[2] - a[2];
  const vx = c[0] - a[0],
    vy = c[1] - a[1],
    vz = c[2] - a[2];
  let nx = uy * vz - uz * vy;
  let ny = uz * vx - ux * vz;
  let nz = ux * vy - uy * vx;
  const len = Math.hypot(nx, ny, nz);
  if (!(len > 1e-8)) return; // zero-area face

  nx /= len;
  ny /= len;
  nz /= len;
  // Winding is inconsistent across `.phy` blocks: classify on absolute tilt,
  // normal up; a wall blocks from both sides.
  if (ny < 0) {
    nx = -nx;
    ny = -ny;
    nz = -nz;
  }

  const spanX = Math.max(a[0], b[0], c[0]) - Math.min(a[0], b[0], c[0]);
  const spanZ = Math.max(a[2], b[2], c[2]) - Math.min(a[2], b[2], c[2]);
  if (spanX > MAX_HALF_SIZE * 2 || spanZ > MAX_HALF_SIZE * 2) return;

  const kind: SurfaceKind =
    ny >= WALKABLE_NORMAL_Y ? 'floor' : ny <= WALL_NORMAL_Y ? 'wall' : 'other';

  out.push({
    v: [a, b, c],
    n: [nx, ny, nz],
    minY: Math.min(a[1], b[1], c[1]),
    maxY: Math.max(a[1], b[1], c[1]),
    kind,
    path,
    wood,
  });
}

/** The index cells a triangle's XZ footprint overlaps. */
function cellsOf(t: CollisionTri): number[] {
  const [a, b, c] = t.v;
  const cx0 = Math.floor(Math.min(a[0], b[0], c[0]) / CELL_SIZE);
  const cx1 = Math.floor(Math.max(a[0], b[0], c[0]) / CELL_SIZE);
  const cz0 = Math.floor(Math.min(a[2], b[2], c[2]) / CELL_SIZE);
  const cz1 = Math.floor(Math.max(a[2], b[2], c[2]) / CELL_SIZE);
  const keys: number[] = [];
  for (let cx = cx0; cx <= cx1; cx++) {
    for (let cz = cz0; cz <= cz1; cz++) keys.push(gridKey(cx, cz));
  }
  return keys;
}

/** The triangle plane's height at (x, z) (barycentric), or null outside its footprint. */
export function heightAt(t: CollisionTri, x: number, z: number): number | null {
  const [v0, v1, v2] = t.v;
  const x0 = v0[0],
    z0 = v0[2];
  const x1 = v1[0],
    z1 = v1[2];
  const x2 = v2[0],
    z2 = v2[2];
  const det = (z1 - z2) * (x0 - x2) + (x2 - x1) * (z0 - z2);
  if (Math.abs(det) < 1e-9) return null; // vertical face: no footprint
  const l0 = ((z1 - z2) * (x - x2) + (x2 - x1) * (z - z2)) / det;
  const l1 = ((z2 - z0) * (x - x2) + (x0 - x2) * (z - z2)) / det;
  const l2 = 1 - l0 - l1;
  const e = -1e-6;
  if (l0 < e || l1 < e || l2 < e) return null;
  return l0 * v0[1] + l1 * v1[1] + l2 * v2[1];
}

/**
 * Closest point on a triangle's XZ footprint to (x, z), with the squared
 * distance to it. `d2 === 0` means the point is inside the footprint.
 */
export function closestPointXZ(
  t: CollisionTri,
  x: number,
  z: number,
): { x: number; z: number; d2: number } {
  const [v0, v1, v2] = t.v;
  const px = [v0[0], v1[0], v2[0]];
  const pz = [v0[2], v1[2], v2[2]];

  // A wall's footprint is a line, which the sign test would call infinitely
  // wide; only test footprints with area.
  const area2 = (px[1] - px[0]) * (pz[2] - pz[0]) - (pz[1] - pz[0]) * (px[2] - px[0]);
  if (Math.abs(area2) > 1e-9) {
    const side = (i: number, j: number) =>
      (px[j] - px[i]) * (z - pz[i]) - (pz[j] - pz[i]) * (x - px[i]);
    const s0 = side(0, 1),
      s1 = side(1, 2),
      s2 = side(2, 0);
    if ((s0 >= 0 && s1 >= 0 && s2 >= 0) || (s0 <= 0 && s1 <= 0 && s2 <= 0)) {
      return { x, z, d2: 0 };
    }
  }

  let bx = 0,
    bz = 0,
    bd2 = Infinity;
  for (const [i, j] of [
    [0, 1],
    [1, 2],
    [2, 0],
  ] as const) {
    const ax = px[i],
      az = pz[i];
    const ex = px[j] - ax,
      ez = pz[j] - az;
    const len2 = ex * ex + ez * ez;
    const s = len2 > 1e-12 ? clamp01(((x - ax) * ex + (z - az) * ez) / len2) : 0;
    const qx = ax + ex * s,
      qz = az + ez * s;
    const d2 = (x - qx) * (x - qx) + (z - qz) * (z - qz);
    if (d2 < bd2) {
      bd2 = d2;
      bx = qx;
      bz = qz;
    }
  }
  return { x: bx, z: bz, d2: bd2 };
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Local space -> world: scale, then the placement's quaternion, then translate. */
function transform(v: Vec3, pos: Vec3, rot: [number, number, number, number], scale: Vec3): Vec3 {
  let x = v[0] * scale[0];
  let y = v[1] * scale[1];
  let z = v[2] * scale[2];

  const [qx, qy, qz, qw] = rot;
  const ix = qw * x + qy * z - qz * y;
  const iy = qw * y + qz * x - qx * z;
  const iz = qw * z + qx * y - qy * x;
  const iw = -qx * x - qy * y - qz * z;
  x = ix * qw + iw * -qx + iy * -qz - iz * -qy;
  y = iy * qw + iw * -qy + iz * -qx - ix * -qz;
  z = iz * qw + iw * -qz + ix * -qy - iy * -qx;

  return [x + pos[0], y + pos[1], z + pos[2]];
}

/** Moller-Trumbore; `t` in 0..1 or null. No back-face rejection: a hit from behind counts. */
function segmentTriangle(
  o: Vec3,
  dx: number,
  dy: number,
  dz: number,
  t: CollisionTri,
): number | null {
  const [v0, v1, v2] = t.v;
  const e1x = v1[0] - v0[0],
    e1y = v1[1] - v0[1],
    e1z = v1[2] - v0[2];
  const e2x = v2[0] - v0[0],
    e2y = v2[1] - v0[1],
    e2z = v2[2] - v0[2];

  const px = dy * e2z - dz * e2y;
  const py = dz * e2x - dx * e2z;
  const pz = dx * e2y - dy * e2x;
  const det = e1x * px + e1y * py + e1z * pz;
  if (Math.abs(det) < 1e-9) return null; // parallel to the plane
  const inv = 1 / det;

  const tx = o[0] - v0[0],
    ty = o[1] - v0[1],
    tz = o[2] - v0[2];
  const u = (tx * px + ty * py + tz * pz) * inv;
  if (u < 0 || u > 1) return null;

  const qx = ty * e1z - tz * e1y;
  const qy = tz * e1x - tx * e1z;
  const qz = tx * e1y - ty * e1x;
  const v = (dx * qx + dy * qy + dz * qz) * inv;
  if (v < 0 || u + v > 1) return null;

  const hit = (e2x * qx + e2y * qy + e2z * qz) * inv;
  return hit >= 0 && hit <= 1 ? hit : null;
}
