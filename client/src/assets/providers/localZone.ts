/**
 * A zone: a label and its weather, never a unit of ground. Rotation
 * conventions live here (spawn yaw draws as `pi - oy`; `.itm` quaternions
 * conjugated) so placement and collision agree.
 */

import type { ZoneAtmosphere, ZoneData, ZoneInfo } from '../types';
import type { WorldTables, ZoneRow } from '../formats/tables';
import type { Library } from '../vfs/Library';

/**
 * Spawn tables store a yaw `oy`; the body faces `pi - oy` about Y.
 */
export function spawnRotation(yaw: number): [number, number, number, number] {
  const half = (Math.PI - yaw) / 2;
  return [0, Math.sin(half), 0, Math.cos(half)];
}

/**
 * `.itm` stores a placement's orientation as the conjugate of the rotation
 * the model is drawn with.
 */
export function itmRotation(q: readonly number[]): [number, number, number, number] {
  const [x, y, z, w] = q;
  const n = Math.hypot(x, y, z, w);
  return n < 1e-9 ? [0, 0, 0, 1] : [-x / n, -y / n, -z / n, w / n];
}

export function placementScale(s: readonly number[]): [number, number, number] {
  return [s[0] || 1, s[1] || 1, s[2] || 1];
}

/** A node's world position on a placed object: offset scaled and rotated (`v + 2w(q×v) + 2(q×(q×v))`), plus position. */
export function offsetBy(
  pos: [number, number, number],
  local: [number, number, number] | undefined,
  q: [number, number, number, number],
  scale: number,
): [number, number, number] {
  if (!local) return pos;
  const [lx, ly, lz] = [local[0] * scale, local[1] * scale, local[2] * scale];
  const [qx, qy, qz, qw] = q;
  const tx = 2 * (qy * lz - qz * ly);
  const ty = 2 * (qz * lx - qx * lz);
  const tz = 2 * (qx * ly - qy * lx);
  return [
    pos[0] + lx + qw * tx + (qy * tz - qz * ty),
    pos[1] + ly + qw * ty + (qz * tx - qx * tz),
    pos[2] + lz + qw * tz + (qx * ty - qy * tx),
  ];
}

/**
 * `'world/sandbox.wld'` -> `'sandbox'`.
 *
 * Several things are named off a map's `.wld` file: the pack holding its
 * tiles, its minimap thumbnails and its zone's loading art.
 */
export function worldStem(tables: WorldTables, mapId: number): string | null {
  const info = tables.maps().find(m => m.id === mapId);
  if (!info) return null;
  return (info.world.split(/[\\/]/).pop() ?? '').replace(/\.[^.]*$/, '') || null;
}

/** `'world/sandbox.wld'` -> the pack holding that map's tiles. */
export function mapPackName(tables: WorldTables, lib: Library, mapId: number): string | null {
  const stem = worldStem(tables, mapId);
  if (!stem) return null;
  const name = `${stem}.bin`;
  return lib.hasPack(name) ? name : null;
}

/**
 * The id the first world with no row of its own is listed under.
 *
 * Well past anything the tables number, so a made-up id can never be
 * mistaken for one the build itself gave a zone.
 */
export const UNLISTED_WORLD_ID = 900_000;

/** Worlds with packs but no map row (the selection map); a pack with its own layer pack is a world. */
export function unlistedWorlds(tables: WorldTables, lib: Library): ZoneInfo[] {
  const listed = new Set(
    tables
      .maps()
      .map(map => (map.world.split(/[\\/]/).pop() ?? '').replace(/\.[^.]*$/, ''))
      .filter(Boolean)
      .map(stem => stem.toLowerCase()),
  );
  const found: ZoneInfo[] = [];
  for (const pack of lib.packNames()) {
    const stem = pack.replace(/\.bin$/i, '');
    if (!/\.bin$/i.test(pack) || /_layer$/i.test(stem)) continue;
    if (listed.has(stem.toLowerCase())) continue;
    if (!lib.hasPack(`${stem}_layer.bin`)) continue;
    found.push({
      id: UNLISTED_WORLD_ID + found.length,
      name: stem,
      mapId: -1,
      mapName: stem,
      world: stem,
      centre: [0, 0],
      bounds: [0, 0, 0, 0],
      hasScenery: true,
      parentId: -1,
      priority: 1,
      icon: '',
      friendly: 0,
      atmosphere: atmosphereFrom(undefined),
      sound: { music: 0, ambience: 0 },
    });
  }
  return found;
}

/** A zone table colour: red in the low byte, blue in the third. */
function unpackColour(packed: number): [number, number, number] {
  return [(packed & 0xff) / 255, ((packed >> 8) & 0xff) / 255, ((packed >> 16) & 0xff) / 255];
}

export function atmosphereFrom(z: ZoneRow | undefined): ZoneAtmosphere {
  return {
    fogColor: z?.fogColor ? unpackColour(z.fogColor) : [0.5, 0.62, 0.72],
    ...(z?.sunColor ? { sunColor: unpackColour(z.sunColor) } : {}),
    ...(z?.shadeColor ? { shadeColor: unpackColour(z.shadeColor) } : {}),
    fogNear: z?.fogNear || 45,
    fogFar: z?.fogFar || 260,
    skybox: z?.skybox || null,
    skyHill: z?.skyHill || null,
    skySun: z?.skySun || null,
  };
}

export function zoneInfoOf(zone: ZoneRow): ZoneInfo {
  return {
    id: zone.id,
    name: zone.name,
    mapId: zone.mapId,
    mapName: zone.mapName,
    centre: zone.centre,
    bounds: zone.bounds,
    hasScenery: zone.hasScenery,
    parentId: zone.parentId,
    priority: zone.priority,
    icon: zone.icon,
    friendly: zone.friendly,
    atmosphere: atmosphereFrom(zone),
    sound: { music: zone.music, ambience: zone.ambience },
  };
}

/** The zone itself. The ground it is drawn over is streamed per tile. */
export function buildZone(zone: ZoneRow): ZoneData {
  return {
    info: zoneInfoOf(zone),
    spawn: [zone.centre[0], zone.centre[1]],
  };
}
