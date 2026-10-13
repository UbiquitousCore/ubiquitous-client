/** The server's baked walkable polygons for a map, copied for operator inspection only; pure math. */

import type { Vec3 } from './CollisionWorld';

/** One convex patch of walkable ground, in world units. */
export interface NavPolygon {
  /** The polygon's own number in the map's whole mesh. Links name these. */
  index: number;
  /** Convex outline, three or four corners, each carrying its own height. */
  vertices: Vec3[];
  /** Polygons a body may step into from this one. */
  links: number[];
}

/** The body and ground rules a map was baked with. */
export interface NavParameters {
  cellSize: number;
  bodyRadius: number;
  stepHeight: number;
  maxSlopeDegrees: number;
  headroom: number;
}

/** What the server sent, decoded but not yet indexed. */
export interface NavigationGroundData {
  mapId: number;
  /** False when this server holds no walkable ground for the map at all. */
  baked: boolean;
  /** Polygons in the whole map, of which `polygons` is the part sent. */
  polygonCount: number;
  /** Where the server measured from — the player's own position. */
  centre: Vec3;
  radius: number;
  /** True when the answer hit the server's own cap and is part of a view. */
  truncated: boolean;
  parameters: NavParameters | null;
  polygons: NavPolygon[];
  /** The polygon the server put the player on when asked, if any. */
  standingOn: number | null;
  /** The height that polygon claimed at the player's feet, if any. */
  groundY: number | null;
  /** Where the player actually was when the server answered. */
  playerY: number;
  /** The nearest floor the bake holds at all, however far off. */
  nearestY?: number | null;
}

/** The server's query slack: shared edges meet exactly, so rounding would read as holes. */
const EDGE_SLACK = 0.001;

/** A polygon with the plane and bounds a lookup needs held ready. */
interface Patch {
  polygon: NavPolygon;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** y = a*x + b*z + c. */
  a: number;
  b: number;
  c: number;
  centroid: Vec3;
}

/** What `summary` reports — the numbers that tell a good bake from a bad one. */
export interface NavigationSummary {
  mapId: number;
  baked: boolean;
  /** Polygons drawn, and polygons the whole map has. */
  drawn: number;
  polygonCount: number;
  truncated: boolean;
  radius: number;
  parameters: NavParameters | null;
  /** The polygon under the player now, or null when they are off the mesh. */
  standingOn: number | null;
  /**
   * What that polygon says the floor is at the player's feet, and where the
   * player actually is. The gap between them is the single most useful number
   * here: a bake that put the ground in the wrong place shows up as drift.
   */
  groundY: number | null;
  playerY: number;
  drift: number | null;
  /**
   * The nearest floor the bake holds at all, however far from the player.
   *
   * Where the server says it would stand nobody here, this is what says
   * whether the bake is missing this floor or has put it somewhere else.
   */
  nearestY: number | null;
  /** Links leaving the polygon under the player. */
  links: number[];
  /**
   * Polygons whose outlines touch the one under the player but that carry no
   * link to it. A doorway the bake closed looks exactly like this.
   */
  touchingWithoutLink: number[];
}

export class NavigationGround {
  private readonly patches: Patch[] = [];
  private readonly byIndex = new Map<number, Patch>();

  constructor(readonly data: NavigationGroundData) {
    for (const polygon of data.polygons) {
      const patch = buildPatch(polygon);
      this.patches.push(patch);
      this.byIndex.set(polygon.index, patch);
    }
  }

  get polygons(): NavPolygon[] {
    return this.data.polygons;
  }

  /** The middle of a polygon's outline, which is where a link is drawn from. */
  centroidOf(index: number): Vec3 | null {
    return this.byIndex.get(index)?.centroid ?? null;
  }

  /** The polygon whose floor at (x, z) is nearest `nearY`: floors of a building stack over one point. */
  polygonAt(x: number, z: number, nearY: number): NavPolygon | null {
    let best: Patch | null = null;
    let bestDrift = Infinity;
    for (const patch of this.patches) {
      if (!containsXZ(patch, x, z)) continue;
      const drift = Math.abs(heightAt(patch, x, z) - nearY);
      if (drift >= bestDrift) continue;
      best = patch;
      bestDrift = drift;
    }
    return best?.polygon ?? null;
  }

  /** One polygon's own floor height at (x, z), whether or not it covers the point. */
  heightOf(index: number, x: number, z: number): number | null {
    const patch = this.byIndex.get(index);
    return patch ? heightAt(patch, x, z) : null;
  }

  /** Printed numbers about the player's spot; the floor is the server's own answer, not a nearest-floor guess. */
  summary(x: number, y: number, z: number): NavigationSummary {
    const standingOn = this.data.standingOn ?? null;
    const under = standingOn === null ? null : (this.byIndex.get(standingOn)?.polygon ?? null);
    const groundY = this.data.groundY ?? null;
    const nearest = this.polygonAt(x, z, y);
    return {
      mapId: this.data.mapId,
      baked: this.data.baked,
      drawn: this.data.polygons.length,
      polygonCount: this.data.polygonCount,
      truncated: this.data.truncated,
      radius: this.data.radius,
      parameters: this.data.parameters,
      standingOn,
      groundY,
      playerY: y,
      drift: groundY === null ? null : y - groundY,
      nearestY: this.data.nearestY ?? (nearest ? this.heightOf(nearest.index, x, z) : null),
      links: under ? [...under.links] : [],
      touchingWithoutLink: under ? this.touchingWithoutLink(under) : [],
    };
  }

  /** Touching footprints with no link: how a bake closes a doorway. The bake's rectangles are axis-aligned. */
  private touchingWithoutLink(polygon: NavPolygon): number[] {
    const self = this.byIndex.get(polygon.index);
    if (!self) return [];
    const out: number[] = [];
    for (const other of this.patches) {
      if (other.polygon.index === polygon.index) continue;
      if (polygon.links.includes(other.polygon.index)) continue;
      if (!boxesTouch(self, other)) continue;
      // A floor directly above or below is not a closed doorway, it is
      // another storey; only ground within one step of this one is worth
      // reporting.
      const step = this.data.parameters?.stepHeight ?? 0.5;
      if (Math.abs(other.centroid[1] - self.centroid[1]) > step) continue;
      out.push(other.polygon.index);
    }
    return out;
  }
}

function buildPatch(polygon: NavPolygon): Patch {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  let sumX = 0;
  let sumY = 0;
  let sumZ = 0;
  for (const [vx, vy, vz] of polygon.vertices) {
    minX = Math.min(minX, vx);
    maxX = Math.max(maxX, vx);
    minZ = Math.min(minZ, vz);
    maxZ = Math.max(maxZ, vz);
    sumX += vx;
    sumY += vy;
    sumZ += vz;
  }
  const n = polygon.vertices.length || 1;
  const [a, b, c] = fitPlane(polygon.vertices, sumY / n);
  return {
    polygon,
    minX,
    maxX,
    minZ,
    maxZ,
    a,
    b,
    c,
    centroid: [sumX / n, sumY / n, sumZ / n],
  };
}

/**
 * The plane the polygon's corners lie on, so a hillside reads as a slope
 * rather than a step. Falls back to the outline's own average height where
 * every trio of corners is edge-on, which a baked polygon never is.
 */
function fitPlane(vertices: Vec3[], averageY: number): [number, number, number] {
  for (let i = 2; i < vertices.length; i++) {
    const p0 = vertices[0];
    const p1 = vertices[i - 1];
    const p2 = vertices[i];
    const ux = p1[0] - p0[0];
    const uy = p1[1] - p0[1];
    const uz = p1[2] - p0[2];
    const vx = p2[0] - p0[0];
    const vy = p2[1] - p0[1];
    const vz = p2[2] - p0[2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    if (Math.abs(ny) < 1e-6) continue;
    const a = -nx / ny;
    const b = -nz / ny;
    return [a, b, p0[1] - a * p0[0] - b * p0[2]];
  }
  return [0, 0, averageY];
}

function heightAt(patch: Patch, x: number, z: number): number {
  return patch.a * x + patch.b * z + patch.c;
}

/**
 * A convex outline contains a point when the point sits on the same side of
 * every edge. Which side that is depends on the winding, so both answers are
 * accepted and only a mixture is a miss.
 */
function containsXZ(patch: Patch, x: number, z: number): boolean {
  if (
    x < patch.minX - EDGE_SLACK ||
    x > patch.maxX + EDGE_SLACK ||
    z < patch.minZ - EDGE_SLACK ||
    z > patch.maxZ + EDGE_SLACK
  ) {
    return false;
  }
  const v = patch.polygon.vertices;
  let anyPositive = false;
  let anyNegative = false;
  for (let i = 0; i < v.length; i++) {
    const a = v[i];
    const b = v[(i + 1) % v.length];
    const cross = (b[0] - a[0]) * (z - a[2]) - (b[2] - a[2]) * (x - a[0]);
    if (cross > EDGE_SLACK) anyPositive = true;
    if (cross < -EDGE_SLACK) anyNegative = true;
    if (anyPositive && anyNegative) return false;
  }
  return true;
}

function boxesTouch(a: Patch, b: Patch): boolean {
  return (
    a.minX - EDGE_SLACK <= b.maxX &&
    b.minX - EDGE_SLACK <= a.maxX &&
    a.minZ - EDGE_SLACK <= b.maxZ &&
    b.minZ - EDGE_SLACK <= a.maxZ
  );
}
